"use client";

import { useState } from "react";
import { LABOR_SUBS, type AccountDef, type AccountGroup, type Behavior } from "@/lib/accounts";
import { won } from "@/lib/csv";
import { syncSettings } from "@/lib/useSettings";
import { aliasesOf, forgetAlias, rememberAlias } from "@/lib/learned";
import { updateLearned, useLearned } from "@/lib/useLearned";
import type { FixedTemplateItem } from "@/lib/fixedTemplate";
import {
  addAccount,
  addSub,
  applySettings,
  downloadSettings,
  removeAccount,
  removeFixed,
  removeSub,
  renameAccount,
  renameSubInSettings,
  resetSettings,
  saveSettings,
  setAccountBehavior,
  setLaborBehavior,
  upsertFixed,
  type Settings,
} from "@/lib/settings";
import { clearAllMonths, listStoredMonths, loadMonth } from "@/lib/store";
import { Btn, Field, Panel } from "./ui";

type Tab = "accounts" | "alias" | "fixed" | "data";

const GROUP_LABEL: Record<string, string> = {
  expense: "사업 지출",
  personal: "개인 (손익 제외)",
  revenue: "매출",
  excluded: "기타수입 (손익 제외)",
};

export function SettingsView({
  settings,
  onChange,
  onReloadMonth,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  /** 데이터를 지운 뒤 현재 보고 있는 달을 다시 읽게 한다 */
  onReloadMonth: () => void;
}) {
  const [tab, setTab] = useState<Tab>("accounts");

  const set = (s: Settings) => {
    applySettings(s);
    saveSettings(s);
    // 분류 화면의 드롭다운도 같은 설정을 본다 — 안 알려주면 옛 목록이 남는다
    syncSettings(s);
    onChange(s);
  };

  return (
    <main className="work">
      <div className="greet">
        <h1>설정</h1>
        <p>계정과목과 고정비는 코드가 아니라 여기서 정합니다. 바꾸면 드롭다운과 집계가 바로 따라갑니다.</p>
      </div>

      <div className="toolbar">
        <button className="chip" aria-pressed={tab === "accounts"} onClick={() => setTab("accounts")}>
          카테고리 설정
        </button>
        <button className="chip" aria-pressed={tab === "alias"} onClick={() => setTab("alias")}>
          표시 이름
        </button>
        <button className="chip" aria-pressed={tab === "fixed"} onClick={() => setTab("fixed")}>
          고정비 템플릿 {settings.fixedTemplate.length}
        </button>
        <button className="chip" aria-pressed={tab === "data"} onClick={() => setTab("data")}>
          데이터
        </button>
        <span className="sp">
          <button className="ghost" onClick={() => downloadSettings(settings)}>설정 내보내기</button>
          <button
            className="ghost"
            onClick={() => {
              if (confirm("계정과목·고정비 설정을 기본값으로 되돌립니다. 정산 데이터는 지워지지 않습니다.")) {
                onChange(resetSettings());
              }
            }}
          >
            기본값으로
          </button>
        </span>
      </div>

      {tab === "accounts" && <AccountsTab settings={settings} set={set} />}
      {tab === "alias" && <AliasTab />}
      {tab === "fixed" && <FixedTab settings={settings} set={set} />}
      {tab === "data" && <DataTab onReloadMonth={onReloadMonth} />}
    </main>
  );
}

/* ── 계정과목 ──────────────────────────────────────────── */

function AccountsTab({ settings, set }: { settings: Settings; set: (s: Settings) => void }) {
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState<AccountGroup>("expense");
  const groups: AccountGroup[] = ["expense", "personal", "revenue", "excluded"];

  return (
    <section className="grid">
      <Panel className="c8" title="계정과목" sub="이름·고정변동·소분류를 여기서 고칩니다">
        {groups.map((g) => {
          const list = settings.accounts.filter((a) => a.group === g);
          if (!list.length) return null;
          return (
            <div key={g} style={{ marginBottom: 20 }}>
              <div className="sectlab">
                <h3 style={{ fontSize: 13 }}>{GROUP_LABEL[g]}</h3>
                <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700 }}>{list.length}개</span>
              </div>
              {list.map((a) => (
                <AccountRow key={a.name} account={a} settings={settings} set={set} />
              ))}
            </div>
          );
        })}

        <div className="okbox" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <Field label="새 계정 이름">
            <input className="inp" style={{ width: 160 }} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="예: 배달대행비" />
          </Field>
          <Field label="구분">
            <select className="inp" value={newGroup} onChange={(e) => setNewGroup(e.target.value as AccountGroup)}>
              {groups.map((g) => (
                <option key={g} value={g}>{GROUP_LABEL[g]}</option>
              ))}
            </select>
          </Field>
          <Btn
            tone="primary"
            disabled={!newName.trim()}
            onClick={() => {
              set(addAccount(settings, newName, newGroup, newGroup === "expense" ? "variable" : null));
              setNewName("");
            }}
          >
            추가
          </Btn>
        </div>
      </Panel>

      <Panel className="c4" title="인건비 고정·변동" sub="소분류마다 따로 둡니다 (§4-3)">
        <p className="note-line" style={{ marginBottom: 12 }}>
          직원이 그만두거나 근무 형태가 바뀌면 그 달부터 바꿉니다. 손익분기점은 이 값을 읽어 계산합니다.
        </p>
        {LABOR_SUBS.map((l) => (
          <div className="kv" key={l.sub}>
            <span className="k">{l.sub}</span>
            <span>
              <select
                className="inp"
                value={settings.behavior.laborSubs[l.sub] ?? l.behavior}
                onChange={(e) => set(setLaborBehavior(settings, l.sub, e.target.value as Behavior))}
              >
                <option value="fixed">고정</option>
                <option value="variable">변동</option>
              </select>
            </span>
          </div>
        ))}
      </Panel>
    </section>
  );
}

function AccountRow({
  account,
  settings,
  set,
}: {
  account: AccountDef;
  settings: Settings;
  set: (s: Settings) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(account.name);
  const [newSub, setNewSub] = useState("");

  return (
    <div className="node" style={{ borderBottom: "1px solid var(--line)" }}>
      <div className="row lv1" style={{ gridTemplateColumns: "1fr auto auto auto" }}>
        <span className="nm">
          <input
            className="inp"
            style={{ width: 150 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() !== account.name && set(renameAccount(settings, account.name, name))}
            aria-label="계정 이름"
          />
          <span className="compose">소분류 {account.subs.length}개</span>
        </span>
        <span>
          {account.group === "expense" && account.name !== "인건비" && (
            <select
              className="inp"
              value={settings.behavior.accounts[account.name] ?? ""}
              onChange={(e) => set(setAccountBehavior(settings, account.name, (e.target.value || null) as Behavior | null))}
              aria-label="고정 변동"
            >
              <option value="">—</option>
              <option value="fixed">고정</option>
              <option value="variable">변동</option>
            </select>
          )}
          {account.name === "인건비" && <span className="badge">소분류별</span>}
        </span>
        <span>
          <button className="tool" onClick={() => setOpen((v) => !v)}>
            소분류 {open ? "닫기" : "열기"}
          </button>
        </span>
        <span>
          <button
            className="tool"
            onClick={() => {
              if (confirm(`'${account.name}' 계정을 지웁니다. 이미 이 계정으로 분류된 거래는 그대로 남고 미분류로 보입니다.`)) {
                set(removeAccount(settings, account.name));
              }
            }}
          >
            삭제
          </button>
        </span>
      </div>

      {open && (
        <div style={{ paddingLeft: 22, paddingBottom: 12 }}>
          {account.subs.map((sub) => (
            <SubRow key={sub} account={account.name} sub={sub} settings={settings} set={set} />
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              className="inp"
              style={{ width: 150 }}
              placeholder="새 소분류"
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newSub.trim()) {
                  set(addSub(settings, account.name, newSub));
                  setNewSub("");
                }
              }}
            />
            <Btn
              disabled={!newSub.trim()}
              onClick={() => {
                set(addSub(settings, account.name, newSub));
                setNewSub("");
              }}
            >
              추가
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function SubRow({
  account,
  sub,
  settings,
  set,
}: {
  account: string;
  sub: string;
  settings: Settings;
  set: (s: Settings) => void;
}) {
  const [v, setV] = useState(sub);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
      <input
        className="inp"
        style={{ width: 170 }}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v.trim() !== sub && set(renameSubInSettings(settings, account, sub, v))}
        aria-label="소분류 이름"
      />
      <button className="tool" onClick={() => set(removeSub(settings, account, sub))}>
        삭제
      </button>
    </div>
  );
}

/* ── 고정비 템플릿 ─────────────────────────────────────── */

function FixedTab({ settings, set }: { settings: Settings; set: (s: Settings) => void }) {
  const [draft, setDraft] = useState<FixedTemplateItem>({
    account: settings.accounts.find((a) => a.group === "expense")?.name ?? "고정운영비",
    sub: "",
    amount: 0,
    editable: false,
  });
  const total = settings.fixedTemplate.reduce((a, b) => a + b.amount, 0);

  return (
    <section className="grid">
      <Panel
        className="c12"
        title="고정비 템플릿"
        sub="'템플릿에서 시작'을 누르면 이 목록이 그대로 들어갑니다"
        right={<span className="num" style={{ fontWeight: 800 }}>{won(total)}</span>}
      >
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>계정</th>
                <th style={{ textAlign: "left" }}>항목</th>
                <th>금액</th>
                <th style={{ textAlign: "left" }}>매월</th>
                <th>범위 하한</th>
                <th>범위 상한</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {settings.fixedTemplate.map((f, i) => (
                <tr key={`${f.account}-${f.sub}-${i}`}>
                  <td>
                    <select
                      className="inp"
                      value={f.account}
                      onChange={(e) => set(upsertFixed(settings, { ...f, account: e.target.value }, i))}
                    >
                      {settings.accounts.filter((a) => a.group === "expense").map((a) => (
                        <option key={a.name}>{a.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="inp"
                      style={{ width: 130 }}
                      value={f.sub}
                      onChange={(e) => set(upsertFixed(settings, { ...f, sub: e.target.value }, i))}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="inp rt"
                      style={{ width: 118 }}
                      value={f.amount}
                      onChange={(e) => set(upsertFixed(settings, { ...f, amount: Number(e.target.value) || 0 }, i))}
                    />
                  </td>
                  <td style={{ textAlign: "left" }}>
                    <label style={{ fontSize: 11.5, fontWeight: 700, display: "flex", gap: 5, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        className="pickbox"
                        checked={!f.editable}
                        onChange={(e) => set(upsertFixed(settings, { ...f, editable: !e.target.checked }, i))}
                      />
                      동일
                    </label>
                  </td>
                  <td>
                    <input
                      type="number"
                      className="inp rt"
                      style={{ width: 108 }}
                      value={f.range?.[0] ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        set(upsertFixed(settings, { ...f, range: [Number(e.target.value) || 0, f.range?.[1] ?? 0] }, i))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="inp rt"
                      style={{ width: 108 }}
                      value={f.range?.[1] ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        set(upsertFixed(settings, { ...f, range: [f.range?.[0] ?? 0, Number(e.target.value) || 0] }, i))
                      }
                    />
                  </td>
                  <td>
                    <button className="tool" onClick={() => set(removeFixed(settings, i))}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="okbox" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <Field label="계정">
            <select className="inp" value={draft.account} onChange={(e) => setDraft({ ...draft, account: e.target.value })}>
              {settings.accounts.filter((a) => a.group === "expense").map((a) => (
                <option key={a.name}>{a.name}</option>
              ))}
            </select>
          </Field>
          <Field label="항목">
            <input className="inp" style={{ width: 140 }} value={draft.sub} onChange={(e) => setDraft({ ...draft, sub: e.target.value })} placeholder="예: 월세" />
          </Field>
          <Field label="금액">
            <input type="number" className="inp rt" style={{ width: 120 }} value={draft.amount || ""} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) || 0 })} placeholder="0" />
          </Field>
          <Btn
            tone="primary"
            disabled={!draft.sub.trim()}
            onClick={() => {
              set(upsertFixed(settings, { ...draft, sub: draft.sub.trim() }));
              setDraft({ ...draft, sub: "", amount: 0 });
            }}
          >
            추가
          </Btn>
          <span className="note-line">
            매월 금액이 달라지는 항목은 <b>동일</b>을 끄고 범위를 넣으면, 범위 밖일 때 표시됩니다.
          </span>
        </div>
      </Panel>
    </section>
  );
}

/* ── 데이터 ────────────────────────────────────────────── */

function DataTab({ onReloadMonth }: { onReloadMonth: () => void }) {
  const [months, setMonths] = useState<string[]>(() => listStoredMonths());
  const refresh = () => setMonths(listStoredMonths());

  return (
    <section className="grid">
      <Panel className="c8" title="월별 데이터" sub="지워도 계정과목·고정비 설정은 남습니다">
        {months.length ? (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>월</th>
                  <th>거래</th>
                  <th>매출 채널</th>
                  <th style={{ textAlign: "left" }}>상태</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const st = loadMonth(m);
                  return (
                    <tr key={m}>
                      <td><b>{`${m.split("-")[0]}년 ${Number(m.split("-")[1])}월`}</b></td>
                      <td className="num">{st.transactions.length}건</td>
                      <td className="num">{st.revenue.length}개</td>
                      <td style={{ textAlign: "left" }}>
                        <span className={`step-s${st.closed ? " ok" : ""}`}>{st.closed ? "마감" : "진행 중"}</span>
                      </td>
                      <td>
                        <button
                          className="tool"
                          onClick={() => {
                            if (confirm(`${m} 정산 데이터를 지웁니다. 계정과목·고정비 설정은 그대로 남습니다.`)) {
                              window.localStorage.removeItem(`kimssi-settlement:${m}`);
                              refresh();
                              onReloadMonth();
                            }
                          }}
                        >
                          지우기
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="note-line">저장된 달이 없습니다.</p>
        )}

        <div style={{ marginTop: 16 }}>
          <Btn
            tone="danger"
            onClick={() => {
              if (confirm("저장된 모든 달의 정산 데이터를 지웁니다. 되돌릴 수 없습니다. 계정과목·고정비 설정은 남습니다.")) {
                clearAllMonths();
                refresh();
                onReloadMonth();
              }
            }}
          >
            모든 달 지우기
          </Btn>
        </div>
      </Panel>

      <Panel className="c4" title="무엇이 남고 무엇이 지워지나" sub="">
        <div className="kv"><span className="k">정산 데이터 (거래·매출·마감)</span><span className="v" style={{ color: "var(--danger)" }}>지워짐</span></div>
        <div className="kv"><span className="k">계정과목 · 소분류</span><span className="v" style={{ color: "var(--primary)" }}>남음</span></div>
        <div className="kv"><span className="k">고정비 템플릿</span><span className="v" style={{ color: "var(--primary)" }}>남음</span></div>
        <div className="kv"><span className="k">고정·변동 플래그</span><span className="v" style={{ color: "var(--primary)" }}>남음</span></div>
        <div className="kv"><span className="k">거래처 매핑 (학습)</span><span className="v" style={{ color: "var(--danger)" }}>그 달과 함께 지워짐</span></div>
        <p className="note-line" style={{ marginTop: 12 }}>
          거래처 매핑은 달마다 저장됩니다. 지우기 전에 <b>월 정산 → 규칙 내보내기</b>로 받아 두면
          <code> data/mappings.json</code>에 커밋해 계속 쓸 수 있습니다.
        </p>
      </Panel>
    </section>
  );
}

/**
 * 붙여둔 표시 이름 목록.
 * 새로 붙이는 건 분류하면서 그 줄에서 한다 — 여기는 고치거나 지울 때 오는 자리다.
 */
function AliasTab() {
  const learned = useLearned();
  const list = aliasesOf(learned);
  const [match, setMatch] = useState("");
  const [display, setDisplay] = useState("");
  const [bulk, setBulk] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function add() {
    const m = match.trim();
    const d = display.trim();
    if (!m || !d) return;
    updateLearned((l) => rememberAlias(l, { match: m, display: d }));
    setMatch("");
    setDisplay("");
  }

  /**
   * 여러 줄을 한 번에. 시트에서 복사해 붙여넣는 쓰임이다.
   * 한 줄에 '걸리게 할 말'과 '보일 이름'을 탭·쉼표·화살표 중 아무거나로 나눠 적는다.
   */
  function pasteMany() {
    const rows = bulk
      .split(/\r?\n/)
      .map((line) => line.split(/\t|,|→|->|\s{2,}/).map((x) => x.trim()).filter(Boolean))
      .filter((p) => p.length >= 2);
    if (!rows.length) {
      setMsg("읽을 줄이 없습니다. 한 줄에 '걸리게 할 말'과 '보일 이름'을 탭이나 쉼표로 나눠 적어 주세요.");
      return;
    }
    updateLearned((l) => rows.reduce((acc, [m, d]) => rememberAlias(acc, { match: m, display: d }), l));
    setMsg(`${rows.length}줄을 넣었습니다.`);
    setBulk("");
  }

  const download = () => {
    const text = list.map((a) => `${a.match}\t${a.display}`).join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "표시이름.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="grid">
      <Panel
        className="c8"
        title="표시 이름"
        sub="원문은 그대로 두고 화면에만 입힙니다"
        right={list.length ? <button className="ghost" onClick={download}>내보내기</button> : undefined}
      >
        <div className="aliasadd">
          <input
            className="inp"
            value={match}
            placeholder="이 말이 들어 있으면 (예: 우지커피)"
            aria-label="걸리게 할 말"
            onChange={(e) => setMatch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <span className="arrow">→</span>
          <input
            className="inp"
            value={display}
            placeholder="이렇게 보입니다 (예: 우지커피 의정부송산점)"
            aria-label="보일 이름"
            onChange={(e) => setDisplay(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button className="cta" onClick={add} disabled={!match.trim() || !display.trim()}>추가</button>
          <button className="ghost" onClick={() => setBulkOpen((v) => !v)}>
            {bulkOpen ? "붙여넣기 닫기" : "여러 줄 붙여넣기"}
          </button>
        </div>

        {bulkOpen && (
          <div style={{ marginTop: 12 }}>
            <textarea
              className="inp"
              rows={6}
              style={{ width: "100%", fontFamily: "var(--mono)", fontSize: 11.5 }}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={"우지커피\t우지커피 의정부송산점\n주식회사 마켓보로\t마켓보로"}
              aria-label="여러 줄 붙여넣기"
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <button className="cta" onClick={pasteMany}>넣기</button>
              <span className="note-line" style={{ margin: 0 }}>
                한 줄에 하나씩, 탭·쉼표·화살표 중 아무거나로 나눠 적으면 됩니다.
              </span>
            </div>
          </div>
        )}
        {msg && <p className="note-line" style={{ marginTop: 10 }}>{msg}</p>}

        {list.length === 0 ? (
          <p className="note-line" style={{ marginTop: 14 }}>
            아직 없습니다. 위에서 바로 넣거나, <b>월 정산 → 지출 분류</b>에서 줄의 <b>이름</b> 버튼으로도 붙일 수 있습니다.
          </p>
        ) : (
          <div className="tscroll" style={{ marginTop: 14 }}>
            <table className="ttable">
              <thead>
                <tr>
                  <th>이 말이 들어 있으면</th>
                  <th>이렇게 보입니다</th>
                  <th style={{ width: 54 }} />
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.match}>
                    <td>
                      <input
                        className="inp mini"
                        style={{ width: "100%" }}
                        defaultValue={a.match}
                        aria-label={`${a.match} 걸리게 할 말`}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (!next || next === a.match) return;
                          updateLearned((l) =>
                            rememberAlias(forgetAlias(l, a.match), { match: next, display: a.display })
                          );
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="inp mini"
                        style={{ width: "100%" }}
                        defaultValue={a.display}
                        aria-label={`${a.match} 표시 이름`}
                        onBlur={(e) =>
                          updateLearned((l) =>
                            rememberAlias(l, { match: a.match, display: e.target.value || a.match })
                          )
                        }
                      />
                    </td>
                    <td>
                      <button className="tool" onClick={() => updateLearned((l) => forgetAlias(l, a.match))}>
                        지움
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="c4" title="왜 원문을 안 고치나" sub="">
        <p className="note-line">
          카드 내역의 가맹점명은 중복 거르기, 쿠팡 전표 대조, 카드사 내역서 대조의 열쇠입니다.
          원문을 바꾸면 같은 파일을 다시 올렸을 때 다른 거래로 보여 건수가 늘어납니다.
          그래서 원문은 그대로 두고 보이는 이름만 입힙니다 — 줄에 마우스를 올리면 원문이 보입니다.
        </p>
        <p className="note-line" style={{ marginTop: 10 }}>
          띄어쓰기와 기호는 무시하고 견줍니다. &lsquo;우지커피&rsquo; 하나만 넣어도
          &lsquo;우지커피 의정부송산점&rsquo;과 &lsquo;우지커피의정부송산점&rsquo;이 함께 걸립니다.
        </p>
        <p className="note-line" style={{ marginTop: 10 }}>
          이름은 달에 매이지 않습니다. 한 번 넣으면 저장된 모든 달과 앞으로 올릴 파일에 같이 적용됩니다.
        </p>
      </Panel>
    </section>
  );
}
