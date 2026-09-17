"use client";

import { useRef, useState } from "react";
import { won } from "@/lib/csv";
import { readFileText } from "@/lib/decode";
import { mergeTransactions } from "@/lib/dedupe";
import {
  NoHeaderError,
  detectFormat,
  parseCardCsv,
  previewCsv,
  toTransactions,
  type FieldKey,
  type FieldMap,
} from "@/lib/parseCard";
import { parseLedgerCsv } from "@/lib/parseLedger";
import { rulesOf, type ImportLog, type MonthState } from "@/lib/store";
import type { RevenueLine, Transaction } from "@/lib/types";
import { Btn, Field } from "../ui";

const CARDS = ["현대카드", "국민카드", "삼성카드", "신한카드", "롯데카드", "하나카드", "BC카드", "기타"];

interface Pending {
  fileName: string;
  text: string;
  encoding: string;
  rows: string[][];
}

export function UploadStep({
  state,
  update,
}: {
  state: MonthState;
  update: (fn: (s: MonthState) => MonthState) => void;
}) {
  const [card, setCard] = useState(CARDS[0]);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function ingest(
    incoming: Transaction[],
    revenue: RevenueLine[],
    warnings: string[],
    meta: Omit<ImportLog, "added" | "skipped" | "at">
  ) {
    const { merged, added, skipped } = mergeTransactions(state.transactions, incoming);
    setNotes([`${added}건 추가${skipped ? ` · 중복 ${skipped}건 자동 스킵` : ""}`, ...warnings]);
    update((s) => ({
      ...s,
      transactions: merged,
      revenue: revenue.length && !s.revenue.length ? revenue : s.revenue,
      imports: [...s.imports, { ...meta, added, skipped, at: new Date().toISOString() }],
    }));
  }

  function readCard(text: string, encoding: string, fileName: string, manual?: { headerRow: number; map: FieldMap }) {
    const r = parseCardCsv(text, manual ? { manual } : {});
    if (r.month && r.month !== state.month) {
      setError(`이 파일은 ${r.month} 내역입니다. 상단에서 해당 월로 바꾼 뒤 올려 주세요.`);
      return false;
    }
    setError(null);
    ingest(toTransactions(r, state.month, card), [], r.warnings, {
      name: fileName,
      kind: `${card} · 거래 ${r.rows.length}건${manual ? " (열 직접 지정)" : ""}`,
      encoding,
      recon: r.recon ?? undefined,
      headerRow: r.headerRow,
      undated: r.undated,
      unreadable: r.unreadable.map((u) => ({ date: u.date ?? "", merchant: u.merchant })),
      subtotals: r.summaries.map((s) => ({ label: s.label, amount: s.amount })),
      cancelled: r.cancelled.map((c) => ({ date: c.date ?? "", merchant: c.merchant, amount: c.amount })),
      installments: r.installments.map((c) => ({
        date: c.date ?? "",
        merchant: c.merchant,
        amount: c.amount,
        months: c.months,
      })),
    });
    return true;
  }

  async function onFile(file: File) {
    setError(null);
    setNotes([]);
    setPending(null);

    let decoded;
    try {
      decoded = await readFileText(file);
    } catch {
      setError("파일을 읽지 못했습니다.");
      return;
    }
    const { text, encoding } = decoded;

    try {
      if (detectFormat(text) === "ledger") {
        const r = parseLedgerCsv(text, { rules: rulesOf(state) });
        if (r.month !== state.month) {
          setError(`이 파일은 ${r.month} 시트입니다. 상단에서 해당 월로 바꾼 뒤 올려 주세요.`);
          return;
        }
        ingest(r.transactions, r.revenue, r.warnings, {
          name: file.name,
          kind: `기존 가계부 시트 · ${r.blocks.map((b) => `${b.kind} ${b.rows}건`).join(", ")}`,
          encoding,
        });
        return;
      }
      readCard(text, encoding, file.name);
    } catch (e) {
      if (e instanceof NoHeaderError) {
        setPending({ fileName: file.name, text, encoding, rows: previewCsv(text, 10) });
        setError("머리글을 자동으로 찾지 못했습니다. 아래에서 열을 직접 지정해 주세요.");
        return;
      }
      setError(e instanceof Error ? e.message : "파싱 중 오류가 났습니다.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function applyManual(headerRow: number, map: FieldMap) {
    if (!pending) return;
    try {
      if (readCard(pending.text, pending.encoding, pending.fileName, { headerRow, map })) setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "읽지 못했습니다.");
    }
  }

  const last = state.imports[state.imports.length - 1];

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
        <Field label="카드 구분">
          <select className="inp" value={card} onChange={(e) => setCard(e.target.value)}>
            {CARDS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="CSV 파일">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv"
            className="filein"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </Field>
      </div>

      <p className="note-line" style={{ marginTop: 10 }}>
        카드사에서 <b>승인일(이용일) 기준</b>으로 1일~말일을 지정해 내려받으세요. 청구기간은 무시합니다.
        머리글 이름으로 <b>날짜·가맹점명·금액·취소일·할부개월</b> 열을 찾습니다. 못 찾으면 직접 고를 수 있습니다.
        EUC-KR로 저장된 파일도 그대로 읽습니다. 엑셀이면 CSV로 저장한 뒤 올려 주세요.
      </p>

      {error && <div className="errbox">{error}</div>}
      {notes.length > 0 && (
        <div className="okbox">
          {notes.map((n, i) => (
            <div key={i}>· {n}</div>
          ))}
        </div>
      )}

      {pending && <ColumnMapper rows={pending.rows} onApply={applyManual} />}

      {last && <ImportReport log={last} />}

      {state.imports.length > 0 && (
        <table className="data" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>파일</th>
              <th style={{ textAlign: "left" }}>형식</th>
              <th>인코딩</th>
              <th>결과</th>
            </tr>
          </thead>
          <tbody>
            {state.imports.map((im, i) => (
              <tr key={i}>
                <td>{im.name}</td>
                <td style={{ color: "var(--muted)" }}>{im.kind}</td>
                <td style={{ color: "var(--muted)" }}>{im.encoding}</td>
                <td className="num">
                  +{im.added}
                  {im.skipped ? ` / 스킵 ${im.skipped}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div
        style={{
          marginTop: 14,
          border: "1px dashed var(--line-2)",
          borderRadius: "1rem",
          padding: "11px 14px",
          fontSize: 11.5,
          fontWeight: 600,
          color: "var(--muted)",
        }}
      >
        t&apos;order / POS 매출 파일 업로드 — 다음 단계 (형식 확인 후 연결)
      </div>
    </div>
  );
}

/** 읽은 결과. 파일에 집계 줄이 있으면 대조까지 보여준다. */
function ImportReport({ log }: { log: ImportLog }) {
  const c = log.recon;
  const hasDetail =
    (log.subtotals?.length ?? 0) > 0 ||
    (log.cancelled?.length ?? 0) > 0 ||
    (log.installments?.length ?? 0) > 0 ||
    (log.unreadable?.length ?? 0) > 0;
  if (!c && !hasDetail && !log.undated) return null;

  return (
    <div style={{ marginTop: 14 }}>
      <div className="prog" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        <div>
          <div className="lab">머리글 행</div>
          <div className="pv done">{log.headerRow ?? "—"}행</div>
        </div>
        <div>
          <div className="lab">날짜 없는 건</div>
          <div className={`pv ${log.undated ? "warn" : "done"}`}>{log.undated ?? 0}건</div>
        </div>
        <div>
          <div className="lab">집계 행 제외</div>
          <div className="pv done">{log.subtotals?.length ?? 0}개</div>
        </div>
        <div>
          <div className="lab">취소 분리</div>
          <div className={`pv ${log.cancelled?.length ? "warn" : "done"}`}>{log.cancelled?.length ?? 0}건</div>
        </div>
        <div>
          <div className="lab">금액 못 읽음</div>
          <div className={`pv ${log.unreadable?.length ? "warn" : "done"}`}>{log.unreadable?.length ?? 0}건</div>
        </div>
      </div>

      {c && (
        <div className={c.matched ? "okbox" : "errbox"} style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            파일 합계와 대조 — {c.matched ? "일치" : "차이 있음"}
          </div>
          <table className="data" style={{ fontSize: 12 }}>
            <tbody>
              <tr>
                <td>
                  파일 합계 <span style={{ color: "var(--muted)" }}>취소 차감</span>
                </td>
                <td className="num">{c.fileAmount != null ? won(c.fileAmount) : "—"}</td>
                <td className="num" style={{ color: "var(--muted)" }}>
                  {c.fileCount != null ? `${c.fileCount}건` : ""}
                </td>
              </tr>
              <tr>
                <td>파서 집계</td>
                <td className="num">{won(c.parsedAmount)}</td>
                <td className="num" style={{ color: "var(--muted)" }}>
                  {c.approvedCount}건 (유효 {c.parsedCount} + 취소 {c.approvedCount - c.parsedCount})
                </td>
              </tr>
              <tr>
                <td>
                  <b>차이</b>
                </td>
                <td className="num">
                  <b>{c.diffAmount != null ? won(c.diffAmount) : "—"}</b>
                </td>
                <td className="num">
                  <b>{c.diffCount != null ? `${c.diffCount > 0 ? "+" : ""}${c.diffCount}건` : ""}</b>
                </td>
              </tr>
            </tbody>
          </table>
          {!c.matched && c.diffCount === -1 && c.diffAmount != null && c.diffAmount !== 0 && (
            <p style={{ margin: "10px 0 0", fontWeight: 700 }}>
              파일에 {won(-c.diffAmount)}원짜리 1건이 빠져 있습니다.
            </p>
          )}
          {!c.matched &&
            c.diffCount === 0 &&
            c.diffAmount != null &&
            c.diffAmount !== 0 &&
            log.unreadable?.length === 1 && (
              <p style={{ margin: "10px 0 0", fontWeight: 700 }}>
                {log.unreadable[0].date} {log.unreadable[0].merchant} 의 금액이 {won(-c.diffAmount)}원으로
                보입니다. 건수는 맞고 이 건만 못 읽었습니다.
              </p>
            )}
          {c.partsAmount != null && c.fileAmount != null && c.partsAmount !== c.fileAmount && (
            <p style={{ margin: "10px 0 0", fontWeight: 600, color: "var(--ink-2)" }}>
              파일 안에서도 집계가 안 맞습니다 — 개별 합 {won(c.partsAmount)} vs 전체 {won(c.fileAmount)}, 차이{" "}
              {won(c.partsAmount - c.fileAmount)}
              {c.partsAmount - c.fileAmount === c.cancelledAmount && " (= 취소 합계)"}.
            </p>
          )}
        </div>
      )}

      {log.unreadable && log.unreadable.length > 0 && (
        <Fold
          label={`금액을 못 읽은 ${log.unreadable.length}건 — 엑셀 열 너비를 넓혀 다시 내보내 주세요`}
          tone="var(--danger)"
        >
          {log.unreadable.map((u, i) => (
            <tr key={i}>
              <td style={{ color: "var(--muted)" }}>{u.date}</td>
              <td style={{ textAlign: "left" }}>{u.merchant}</td>
              <td className="num" style={{ color: "var(--danger)" }}>######</td>
            </tr>
          ))}
        </Fold>
      )}

      {log.subtotals && log.subtotals.length > 0 && (
        <Fold label={`거래에서 제외한 집계 행 ${log.subtotals.length}개`} tone="var(--muted)">
          {log.subtotals.map((s, i) => (
            <tr key={i}>
              <td>{s.label}</td>
              <td className="num">{won(s.amount)}</td>
            </tr>
          ))}
        </Fold>
      )}

      {log.cancelled && log.cancelled.length > 0 && (
        <Fold label={`취소 ${log.cancelled.length}건 — 지출 집계에서 뺐습니다`} tone="var(--warn)">
          {log.cancelled.map((t, i) => (
            <tr key={i}>
              <td style={{ color: "var(--muted)" }}>{t.date}</td>
              <td style={{ textAlign: "left" }}>{t.merchant}</td>
              <td className="num">{won(t.amount)}</td>
            </tr>
          ))}
        </Fold>
      )}

      {log.installments && log.installments.length > 0 && (
        <Fold label={`할부 ${log.installments.length}건 — 승인금액 원본 그대로`} tone="var(--info)">
          {log.installments.map((t, i) => (
            <tr key={i}>
              <td style={{ color: "var(--muted)" }}>{t.date}</td>
              <td style={{ textAlign: "left" }}>{t.merchant}</td>
              <td className="num" style={{ color: "var(--muted)" }}>
                {t.months || "-"}개월
              </td>
              <td className="num">{won(t.amount)}</td>
            </tr>
          ))}
        </Fold>
      )}
    </div>
  );
}

function Fold({ label, tone, children }: { label: string; tone: string; children: React.ReactNode }) {
  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: tone }}>{label}</summary>
      <table className="data" style={{ marginTop: 8 }}>
        <tbody>{children}</tbody>
      </table>
    </details>
  );
}

/** 카드사마다 머리글이 달라 자동 탐지가 실패할 수 있다. 그때 직접 고르게 한다. */
const MANUAL_FIELDS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: "date", label: "날짜", required: true },
  { key: "merchant", label: "가맹점명", required: true },
  { key: "amount", label: "금액", required: true },
  { key: "cancelDate", label: "취소일 (선택)" },
  { key: "months", label: "할부개월 (선택)" },
  { key: "approvalNo", label: "승인번호 (선택)" },
];

function ColumnMapper({
  rows,
  onApply,
}: {
  rows: string[][];
  onApply: (headerRow: number, map: FieldMap) => void;
}) {
  const width = Math.max(...rows.map((r) => r.length));
  const [headerRow, setHeaderRow] = useState(0);
  const [picked, setPicked] = useState<Record<string, string>>({});

  const cols = Array.from({ length: width }, (_, i) => i);
  const colLabel = (i: number) => `${i + 1}열 — ${(rows[headerRow]?.[i] ?? "").slice(0, 14) || "(빈칸)"}`;
  const ready = MANUAL_FIELDS.filter((f) => f.required).every((f) => picked[f.key] !== undefined && picked[f.key] !== "");

  return (
    <div style={{ marginTop: 16 }}>
      <div className="scroll-x">
        <table className="preview">
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} style={ri === headerRow ? { background: "var(--primary-soft)" } : undefined}>
                <td style={{ color: "var(--muted)" }}>
                  <button className="tool" onClick={() => setHeaderRow(ri)} title="이 줄을 머리글로">
                    {ri + 1}
                  </button>
                </td>
                {cols.map((ci) => (
                  <td key={ci}>{(r[ci] ?? "").slice(0, 18)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="note-line" style={{ marginTop: 10 }}>
        머리글 줄의 번호를 눌러 고르고, 아래에서 열을 지정하세요.
      </p>

      <div className="mapgrid">
        {MANUAL_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <select
              className="inp"
              value={picked[f.key] ?? ""}
              onChange={(e) => setPicked((p) => ({ ...p, [f.key]: e.target.value }))}
            >
              <option value="">{f.required ? "고르세요" : "없음"}</option>
              {cols.map((i) => (
                <option key={i} value={i}>
                  {colLabel(i)}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>

      <Btn
        tone="primary"
        disabled={!ready}
        onClick={() => {
          const map: FieldMap = {};
          for (const f of MANUAL_FIELDS) {
            const v = picked[f.key];
            if (v !== undefined && v !== "") map[f.key] = Number(v);
          }
          onApply(headerRow, map);
        }}
      >
        이 설정으로 읽기
      </Btn>
    </div>
  );
}
