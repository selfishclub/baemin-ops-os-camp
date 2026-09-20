"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loginEmailDomain } from "../../../lib/supabase/env";
import styles from "./staff.module.css";
import { apiFetch } from "../../preview/preview-api";
import PreviewBanner from "../../preview/preview-banner";

type StaffRow = { id: string; login_id: string; display_name: string; role: "owner" | "staff"; active: boolean; created_at: string };

export default function StaffManager({ preview = false }: { preview?: boolean }) {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [me, setMe] = useState("");
  const [message, setMessage] = useState("직원 목록을 불러오는 중입니다.");
  const [busyId, setBusyId] = useState("");

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
        <ol>
          <li>Supabase 대시보드 → <strong>Authentication → Users → Add user → Create new user</strong></li>
          <li>Email 칸에 <code>아이디@{loginEmailDomain}</code> (예: <code>alba-a@{loginEmailDomain}</code>), Password 칸에 임시 비밀번호</li>
          <li><strong>Auto Confirm User</strong>를 켜고 만들기 → 이 화면을 새로고침하면 목록에 나타납니다 (기본 역할: 직원)</li>
          <li>직원에게 아이디와 임시 비밀번호를 직접 전달합니다 (카톡에 남기지 않기)</li>
        </ol>
      </section>
    </main>
  );
}
