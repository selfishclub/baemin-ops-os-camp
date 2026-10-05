"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loginEmailDomain } from "../../../lib/supabase/env";
import styles from "./staff.module.css";
import { apiFetch } from "../../preview/preview-api";
import PreviewBanner from "../../preview/preview-banner";

type StaffRow = { id: string; login_id: string; display_name: string; role: "owner" | "staff"; active: boolean; created_at: string };

// 헷갈리는 글자(0/O, 1/l)를 뺀 임시 비밀번호 10자
function randomPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => letters[byte % letters.length]).join("");
}

export default function StaffManager({ preview = false }: { preview?: boolean }) {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [me, setMe] = useState("");
  const [message, setMessage] = useState("직원 목록을 불러오는 중입니다.");
  const [busyId, setBusyId] = useState("");
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setMessage("");
    const response = await apiFetch(preview, "/api/admin/staff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginId: newId, displayName: newName, password: newPassword }),
    });
    const body = await response.json().catch(() => ({}));
    setCreating(false);
    if (!response.ok) {
      setMessage(body.error ?? "계정을 만들지 못했습니다.");
      return;
    }
    if (body.staff) setRows((current) => [...current.filter((row) => row.id !== body.staff.id), body.staff]);
    setMessage(`${body.staff?.login_id ?? newId} 계정을 만들었습니다. 아이디와 임시 비밀번호를 직원에게 직접 알려 주세요.${body.warning ? ` ${body.warning}` : ""}`);
    setNewId("");
    setNewName("");
    setNewPassword("");
  }

  async function load() {
    const response = await apiFetch(preview, "/api/admin/staff", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "직원 목록을 불러오지 못했습니다.");
      return;
    }
    setRows(body.staff);
    setMe(body.me);
    setMessage("");
  }

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function patch(id: string, changes: Partial<Pick<StaffRow, "active" | "role">> & { displayName?: string }) {
    setBusyId(id);
    const response = await apiFetch(preview, "/api/admin/staff", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...changes }),
    });
    const body = await response.json();
    setBusyId("");
    if (!response.ok) {
      setMessage(body.error ?? "저장하지 못했습니다.");
      return;
    }
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...body.staff } : row)));
    setMessage("저장했습니다.");
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/recipes">← 레시피</Link>
        <h1>직원 계정 관리</h1>
        <p>퇴사한 직원은 <strong>중지</strong>로 바꾸면 그 순간부터 로그인이 막힙니다. 사장 역할은 레시피를 편집할 수 있습니다.</p>
      </header>

      {preview && <PreviewBanner what="직원 계정 관리 (가짜 직원 · 이름 · 역할 · 재직/중지)" role="owner" />}
      {message && <p className={styles.message} role="status">{message}</p>}

      <table className={styles.table}>
        <thead>
          <tr><th>아이디</th><th>표시 이름</th><th>역할</th><th>상태</th><th>가입</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-inactive={!row.active}>
              <td><code>{row.login_id}</code>{row.id === me && <small> (나)</small>}</td>
              <td>
                <input
                  defaultValue={row.display_name}
                  aria-label={`${row.login_id} 표시 이름`}
                  onBlur={(event) => {
                    if (event.target.value.trim() !== row.display_name) void patch(row.id, { displayName: event.target.value });
                  }}
                />
              </td>
              <td>
                <select value={row.role} disabled={row.id === me || busyId === row.id} onChange={(event) => void patch(row.id, { role: event.target.value as StaffRow["role"] })}>
                  <option value="staff">직원</option>
                  <option value="owner">사장</option>
                </select>
              </td>
              <td>
                <button type="button" disabled={row.id === me || busyId === row.id} data-active={row.active} onClick={() => void patch(row.id, { active: !row.active })}>
                  {row.active ? "재직 중 · 중지하기" : "중지됨 · 다시 켜기"}
                </button>
              </td>
              <td>{row.created_at.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className={styles.howto}>
        <h2>새 직원 계정 만들기</h2>
        <form className={styles.createForm} onSubmit={create}>
          <label>
            아이디 (영문·숫자)
            <input value={newId} autoCapitalize="none" autoComplete="off" placeholder="예: alba-a" onChange={(event) => setNewId(event.target.value)} />
          </label>
          <label>
            화면에 보일 이름
            <input value={newName} autoComplete="off" placeholder="예: 직원 A" onChange={(event) => setNewName(event.target.value)} />
          </label>
          <label>
            임시 비밀번호 (8자 이상)
            <span className={styles.passwordRow}>
              <input value={newPassword} autoComplete="new-password" onChange={(event) => setNewPassword(event.target.value)} />
              <button type="button" onClick={() => setNewPassword(randomPassword())}>만들어 주기</button>
            </span>
          </label>
          <button type="submit" disabled={creating}>{creating ? "만드는 중…" : "계정 만들기"}</button>
        </form>
        <ol>
          <li>만든 뒤 직원에게 아이디와 임시 비밀번호를 <strong>직접</strong> 알려 주세요 (카톡에 남기지 않기)</li>
          <li>직원은 첫 로그인 뒤 홈의 <strong>비밀번호 바꾸기</strong>에서 자기 비밀번호로 바꿉니다</li>
          <li>비밀번호를 잊으면 그 계정을 <strong>중지</strong>하고 새 아이디로 다시 만들어 주세요 (여기서는 남의 비밀번호를 바꿀 수 없어요)</li>
          <li>데이터 창고(Supabase)에서 직접 만든 계정은 <strong>중지됨</strong>으로 시작합니다 — 이 목록에서 켜 주어야 볼 수 있어요. 그때 아이디는 <code>아이디@{loginEmailDomain}</code> 꼴로 적습니다</li>
        </ol>
      </section>
    </main>
  );
}
