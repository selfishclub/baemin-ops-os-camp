"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "../login/login.module.css";

export default function PasswordForm({ demo, loginId, displayName }: { demo: boolean; loginId: string; displayName: string }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (demo) {
      setMessage("미리보기에서는 비밀번호를 바꿀 수 없어요.");
      return;
    }
    if (password.length < 8) {
      setMessage("새 비밀번호는 8자 이상이어야 해요.");
      return;
    }
    if (password !== again) {
      setMessage("두 번 입력한 비밀번호가 서로 달라요.");
      return;
    }
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/auth/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(body.error ?? "비밀번호를 바꾸지 못했어요.");
      return;
    }
    setDone(true);
    setPassword("");
    setAgain("");
    setMessage("바꿨어요. 다음 로그인부터 새 비밀번호를 쓰세요.");
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <p className={styles.eyebrow}>BEANSOOP · MY ACCOUNT</p>
        <h1>비밀번호 바꾸기</h1>
        <p className={styles.lead}>{displayName}님 (아이디 <code>{loginId}</code>). 비밀번호는 다른 사람에게 알려 주지 않아요. 잊어버렸으면 사장님께 새 계정을 부탁하세요.</p>
        <label>
          새 비밀번호 (8자 이상)
          <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label>
          한 번 더
          <input type="password" autoComplete="new-password" value={again} onChange={(event) => setAgain(event.target.value)} />
        </label>
        {message && <p className={styles.message} role="alert" data-ok={done}>{message}</p>}
        <button type="submit" disabled={busy || demo}>{busy ? "바꾸는 중…" : "바꾸기"}</button>
        <Link href="/" className={styles.secondary}>← 빈숲 OS</Link>
      </form>
    </main>
  );
}
