"use client";

import { useEffect, useState } from "react";
import { getSupabase, type Session } from "@/lib/supabase/client";

// 인터넷 모드에서 "지금 로그인돼 있나"를 본다. 내 PC 모드(enabled=false)에서는 Supabase 에 손대지 않는다.
//  ready: 처음 확인이 끝났는지 (끝나기 전엔 로그인 화면도 장부도 띄우지 않아 깜빡임을 막는다)
export function useSession(enabled: boolean): { session: Session | null; ready: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!enabled);

  useEffect(() => {
    if (!enabled) return;
    const sb = getSupabase();
    let alive = true;
    void sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      if (!alive) return;
      setSession(s);
      setReady(true);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [enabled]);

  return { session, ready };
}
