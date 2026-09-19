"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { loginIdToEmail } from "../../lib/supabase/env";
import styles from "./login.module.css";

export default function LoginForm({ next, reason }: { next: string; reason: string }) {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const reasonMessage: Record<string, string> = {
    inactive: "사용이 중지된 계정입니다. 사장님께 문의해 주세요.",
    noprofile: "로그인은 됐지만 직원 정보를 읽지 못했습니다. 데이터 창고 권한 설정(supabase/schema.sql)을 확인한 뒤, 아래 로그아웃 후 다시 로그인해 주세요.",
  };
  const [message, setMessage] = useState(reasonMessage[reason] ?? "");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!loginId.trim() || !password) {
      setMessage("아이디와 비밀번호를 모두 입력해 주세요.");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("데이터 창고가 연결되지 않았습니다.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email: loginIdToEmail(loginId), password });
    setBusy(false);
    if (error) {
      setMessage(error.message.includes("Invalid login") ? "아이디 또는 비밀번호가 맞지 않습니다." : `로그인하지 못했습니다: ${error.message}`);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <p className={styles.eyebrow}>BEANSOOP · STAFF ONLY</p>
        <h1>빈숲 레시피OS</h1>
        <p className={styles.lead}>직원 계정으로 로그인하면 레시피를 볼 수 있어요. 계정은 사장님이 만들어 드립니다.</p>
        <label>
          아이디
          <input
            autoComplete="username"
            autoCapitalize="none"
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            placeholder="예: alba-a"
          />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {message && <p className={styles.message} role="alert">{message}</p>}
        <button type="submit" disabled={busy}>{busy ? "확인하는 중…" : "로그인"}</button>
        {reason && (
          <button type="button" className={styles.secondary} onClick={async () => { await fetch("/api/auth/logout", { method: "post" }); window.location.href = "/login"; }}>
            로그아웃하고 처음부터
          </button>
        )}
        <p className={styles.note}>레시피는 가게 영업 비밀입니다. 화면을 밖으로 공유하지 마세요.</p>
      </form>
    </main>
  );
}
