"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./idle-logout.module.css";

// 화면 쪽 자동 로그아웃: 손대지 않은 채 정해진 시간이 지나면 로그아웃한다. 1분 전에 작은 안내를 띄운다.
// 서버(proxy.ts)도 같은 시간을 세므로, 이 타이머가 멈춰 있어도(폰 화면 꺼짐 등) 다음 요청에서 막힌다.
export default function IdleLogout({ minutes }: { minutes: number }) {
  const [warning, setWarning] = useState(false);
  const lastActivity = useRef(0);
  const warned = useRef(false);

  useEffect(() => {
    if (minutes <= 0 || window.location.pathname === "/login") return;
    lastActivity.current = Date.now();
    const limitMs = minutes * 60_000;
    const warnMs = Math.max(limitMs - 60_000, limitMs / 2);

    const touch = () => {
      lastActivity.current = Date.now();
      if (warned.current) {
        warned.current = false;
        setWarning(false);
      }
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "scroll", "touchstart"];
    for (const name of events) window.addEventListener(name, touch, { passive: true });

    const logout = () => {
      window.location.href = "/login?reason=idle";
      // 서버 세션도 끝낸다 (되돌아와도 로그인 화면)
      fetch("/api/auth/logout?reason=idle", { method: "post", keepalive: true }).catch(() => {});
    };

    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= limitMs) {
        window.clearInterval(timer);
        logout();
      } else if (idle >= warnMs && !warned.current) {
        warned.current = true;
        setWarning(true);
      }
    }, 5_000);

    // 화면이 다시 켜졌을 때(폰 잠금 해제) 이미 시간이 지났으면 바로 로그아웃
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastActivity.current >= limitMs) logout();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      for (const name of events) window.removeEventListener(name, touch);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [minutes]);

  if (!warning) return null;
  return (
    <div className={styles.toast} role="status">
      <span>한동안 쓰지 않아 곧 자동으로 로그아웃돼요.</span>
      <button type="button" onClick={() => { lastActivity.current = Date.now(); warned.current = false; setWarning(false); }}>계속 쓰기</button>
    </div>
  );
}
