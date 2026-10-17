"use client";

import { useEffect, useState } from "react";
import { Notice } from "@/components/ui";
import { loginWithPastedLink, sendLoginEmail } from "@/lib/supabase/client";

// 인터넷 모드 로그인 화면 — 비밀번호 없이 이메일 링크로 들어온다.
//  1 이메일 넣고 "로그인 메일 보내기" → 2 메일의 링크를 누르면 끝.
//  아이폰 홈 화면 앱처럼 링크가 다른 창(사파리)에서 열리는 경우엔, 링크를 누르지 말고 길게 눌러 복사해 여기 붙여 넣는다.
//  (Supabase 기본 메일에는 6자리 숫자가 없다 — 문구를 바꾸려면 메일 서버를 따로 붙여야 해서 링크 붙여넣기로 대신한다)
//  가게마다 이메일 하나. 처음 보는 이메일이면 그 자리에서 가게(계정)가 새로 생긴다.
const LAST_EMAIL_KEY = "sootdak-ledger-login-email";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAST_EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch {}
  }, []);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function send() {
    if (!valid || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await sendLoginEmail(email);
      try {
        window.localStorage.setItem(LAST_EMAIL_KEY, email.trim());
      } catch {}
      setSent(true);
      setMsg({ tone: "ok", text: "로그인 메일을 보냈어요. 메일함(스팸함도)에서 '손익 장부' 메일을 열어 링크를 눌러 주세요." });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (busy || !code.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await loginWithPastedLink(code);
      // 로그인되면 AppShell 이 알아차려 장부를 띄운다
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mx-auto mt-6 max-w-md space-y-4">
      <div>
        <h2 className="font-serif text-lg font-bold">장부 열기</h2>
        <p className="mt-1 text-sm text-stone-600">
          비밀번호가 없어요. 이메일로 온 링크를 누르면 들어와요. 같은 이메일로 로그인하면 폰·PC 어디서든 같은 장부가 보여요. 다른 가게 자료는 보이지 않아요.
        </p>
      </div>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {!sent ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="block text-sm font-semibold" htmlFor="login-email">
            이메일
          </label>
          <input
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            className="field"
            placeholder="가게용 이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="btn-primary w-full" disabled={!valid || busy}>
            {busy ? "보내는 중…" : "로그인 메일 보내기"}
          </button>
          <p className="text-xs text-stone-500">처음 쓰는 이메일이면 이 자리에서 가게 장부가 새로 만들어져요.</p>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            <b>{email.trim()}</b> 로 보냈어요. 메일의 <b>링크</b>를 누르면 바로 열려요.
          </p>
          <div className="rounded-xl bg-stone-50 p-3">
            <p className="text-xs text-stone-600">
              <b>아이폰 홈 화면 앱</b>에서는 링크를 누르면 사파리가 열려서 여기는 그대로예요. 그럴 땐 메일의 링크를 <b>누르지 말고 길게 눌러 "링크 복사"</b>한 뒤 아래에 붙여 넣으세요. (링크는 한 번만 쓸 수 있어요)
            </p>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}
            >
              <input
                type="url"
                inputMode="url"
                autoComplete="off"
                className="field flex-1"
                placeholder="메일 링크 붙여넣기"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                aria-label="메일의 로그인 링크"
              />
              <button type="submit" className="btn-primary" disabled={busy || !code.trim()}>
                {busy ? "확인 중…" : "링크로 로그인"}
              </button>
            </form>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={() => void send()}>
              메일 다시 보내기
            </button>
            <button
              className="btn-ghost px-3 py-1.5 text-xs"
              onClick={() => {
                setSent(false);
                setCode("");
                setMsg(null);
              }}
            >
              다른 이메일로
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
