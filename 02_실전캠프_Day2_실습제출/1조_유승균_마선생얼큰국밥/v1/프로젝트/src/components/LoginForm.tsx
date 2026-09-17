"use client";

import { useState } from "react";

export function LoginForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "로그인 실패");
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
      <input
        type="password"
        className="input"
        placeholder="비밀번호"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button type="submit" className="btn btn-primary justify-center" disabled={busy || !password}>
        {busy ? "확인 중…" : "들어가기"}
      </button>
    </form>
  );
}
