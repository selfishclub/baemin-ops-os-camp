"use client";

import { useState } from "react";
import { LABOR_SUBS, type AccountDef, type AccountGroup, type Behavior } from "@/lib/accounts";
import { won } from "@/lib/csv";
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

type Tab = "accounts" | "fixed" | "data";

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
          계정과목
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
