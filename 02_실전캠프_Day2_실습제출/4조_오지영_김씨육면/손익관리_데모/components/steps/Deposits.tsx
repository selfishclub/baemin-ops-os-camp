"use client";

import { useMemo, useState } from "react";
import { REVENUE_CHANNELS } from "@/lib/accounts";
import { won } from "@/lib/csv";
import {
  addDeposit,
  makeDeposit,
  patchDeposit,
  removeDeposit,
  type BankDeposit,
  type DepositKind,
  type MonthState,
} from "@/lib/store";
import { PickAll } from "../ui";

type Update = (fn: (s: MonthState) => MonthState) => void;

const KINDS: DepositKind[] = ["매출", "기타수입", "지영 생활비", "제외"];
const kindOf = (d: BankDeposit): DepositKind => d.kind ?? "매출";

/**
 * 통장에 들어온 돈을 하나씩 가려내는 자리.
 *
 * 입금이 전부 매출은 아니다 — 보험 환급, 개인 송금, 대출이 섞여 들어온다.
 * 지출 분류와 같은 표로 두어 눈이 옮겨 다니지 않게 한다.
 */
export function DepositsStep({ state, update }: { state: MonthState; update: Update }) {
  const [filter, setFilter] = useState<"all" | DepositKind>("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkKind, setBulkKind] = useState<DepositKind>("제외");
  const rows = state.bankDeposits ?? [];

  const shown = useMemo(
    () =>
      [...rows]
        .filter((d) => filter === "all" || kindOf(d) === filter)
        // 1일부터 말일까지 — 다른 단계와 순서를 맞춘다
        .sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount),
    [rows, filter]
  );

  const sum = (k: DepositKind) => rows.filter((d) => kindOf(d) === k).reduce((a, b) => a + b.amount, 0);
  const count = (k: DepositKind) => rows.filter((d) => kindOf(d) === k).length;
  const total = rows.reduce((a, b) => a + b.amount, 0);

  const toggle = (ids: string[]) =>
    setPicked((p) => {
      const n = new Set(p);
      for (const id of ids) {
        if (n.has(id)) n.delete(id);
        else n.add(id);
      }
      return n;
    });
  const setPick = (ids: string[], on: boolean) =>
    setPicked((p) => {
      const n = new Set(p);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  function applyKind() {
    const ids = picked;
    update((s) => ({
      ...s,
      bankDeposits: (s.bankDeposits ?? []).map((d) =>
        ids.has(d.id) ? { ...d, kind: bulkKind, channel: bulkKind === "매출" ? d.channel : null } : d
      ),
    }));
    setPicked(new Set());
  }

  const addRow = () => update((s) => addDeposit(s, makeDeposit({ date: `${s.month}-01` })));

  if (!rows.length) {
    return (
      <p className="note-line">
        아직 입금 내역이 없습니다. 1단계에서 통장 파일을 올리면 여기가 채워집니다.{" "}
        <button className="tool" onClick={addRow}>+ 직접 넣기</button>
      </p>
    );
  }

  return (
    <div>
      <div className="dayhead">
        <div className="daystat">
          <span className="k">입금 전체</span>
          <b className="num">{won(total)}</b>
          <span className="c">{rows.length}건</span>
        </div>
        <div className="daystat ok">
          <span className="k">매출</span>
          <b className="num">{won(sum("매출"))}</b>
          <span className="c">{count("매출")}건</span>
        </div>
        <div className="daystat">
          <span className="k">기타수입</span>
          <b className="num">{won(sum("기타수입"))}</b>
          <span className="c">{count("기타수입")}건</span>
        </div>
        <div className="daystat warn">
          <span className="k">지영 생활비</span>
          <b className="num">{won(sum("지영 생활비"))}</b>
          <span className="c">{count("지영 생활비")}건 · 손익에서 빠집니다</span>
        </div>
        <div className="daystat">
          <span className="k">제외</span>
          <b className="num">{won(sum("제외"))}</b>
          <span className="c">{count("제외")}건</span>
        </div>
      </div>

      <div className="toolbar">
        <button className="chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
          전부 {rows.length}건
        </button>
        {KINDS.map((k) => (
          <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {k} {count(k)}건
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <PickAll ids={shown.map((d) => d.id)} picked={picked} setPick={setPick} label="전체 선택" />
        <button className="chip" onClick={addRow}>+ 행 추가</button>
      </div>

      {picked.size > 0 && (
        <div className="okbox pickbar">
          <b style={{ whiteSpace: "nowrap" }}>
            {picked.size}건 · {won(rows.filter((d) => picked.has(d.id)).reduce((a, b) => a + b.amount, 0))}
          </b>
          <select
            className="inp"
            value={bulkKind}
            onChange={(e) => setBulkKind(e.target.value as DepositKind)}
            aria-label="한꺼번에 지정할 구분"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <button className="tool save" onClick={applyKind}>{picked.size}건을 {bulkKind}으로</button>
          <button className="tool" onClick={() => setPicked(new Set())}>선택 해제</button>
        </div>
      )}

      <div className="txwrap">
        <div className="txline deposit txhead" aria-hidden>
          <span />
          <span>날짜</span>
          <span>보낸 분</span>
          <span>구분</span>
          <span>채널</span>
          <span>메모</span>
          <span className="amt">금액</span>
          <span />
        </div>
        {shown.map((d) => (
          <DepositRow key={d.id} d={d} update={update} picked={picked} toggle={toggle} />
        ))}
      </div>
    </div>
  );
}

function DepositRow({
  d,
  update,
  picked,
  toggle,
}: {
  d: BankDeposit;
  update: Update;
  picked: Set<string>;
  toggle: (ids: string[]) => void;
}) {
  const kind = kindOf(d);
  const 매출 = kind === "매출";
  return (
    <div className={`txline deposit ${매출 ? "done" : kind === "제외" ? "none" : "sug"}${picked.has(d.id) ? " on" : ""}`}>
      <input
        type="checkbox"
        className="pickbox"
        checked={picked.has(d.id)}
        onChange={() => toggle([d.id])}
        aria-label={`${d.who} 선택`}
      />
      <input
        className="inp mini"
        type="date"
        value={d.date}
        aria-label="날짜"
        onChange={(e) => update((s) => patchDeposit(s, d.id, { date: e.target.value }))}
      />
      <input
        className="inp mini"
        value={d.who}
        placeholder="보낸 분"
        aria-label="보낸 분"
        onChange={(e) => update((s) => patchDeposit(s, d.id, { who: e.target.value }))}
      />
      <select
        className="inp mini"
        value={kind}
        aria-label="구분"
        onChange={(e) =>
          update((s) =>
            patchDeposit(s, d.id, {
              kind: e.target.value as DepositKind,
              // 매출이 아니면 채널은 뜻이 없다
              channel: e.target.value === "매출" ? d.channel : null,
            })
          )
        }
      >
        {KINDS.map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>
      <select
        className="inp mini"
        disabled={!매출}
        value={d.channel ?? ""}
        aria-label="채널"
        onChange={(e) => update((s) => patchDeposit(s, d.id, { channel: e.target.value || null }))}
      >
        <option value="">— 채널 —</option>
        {REVENUE_CHANNELS.map((c) => (
          <option key={c.channel} value={c.channel}>{c.channel}</option>
        ))}
      </select>
      <input
        className="memocell"
        defaultValue={d.note ?? ""}
        placeholder="메모"
        aria-label={`${d.who} 메모`}
        onBlur={(e) => update((s) => patchDeposit(s, d.id, { note: e.target.value || null }))}
      />
      {/* 숫자 칸으로 두면 자릿점이 안 찍혀 큰 금액을 못 읽는다. 글 칸으로 두고 읽을 때만 찍는다. */}
      <input
        className="inp mini rt amt num"
        inputMode="numeric"
        value={d.amount ? won(d.amount) : ""}
        placeholder="0"
        aria-label="금액"
        onChange={(e) =>
          update((s) => patchDeposit(s, d.id, { amount: Number(e.target.value.replace(/[^\d-]/g, "")) || 0 }))
        }
      />
      <span>
        <button className="tool" onClick={() => update((s) => removeDeposit(s, d.id))}>삭제</button>
      </span>
    </div>
  );
}
