"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./menus.module.css";
import PreviewBanner from "../../preview/preview-banner";

type MenuRow = {
  id: string;
  title: string;
  group: string;
  status: "open" | "soon";
  locked: boolean;
  fixed: boolean;
  updatedBy: string;
  updatedAt: string;
};

// 미리보기 잠금은 이 브라우저의 쿠키에만 적는다 (서버·다른 사람 화면은 바뀌지 않는다)
function writePreviewLockCookie(name: string, ids: string) {
  document.cookie = `${name}=${encodeURIComponent(ids)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

function when(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function MenuLocks({ preview = false, previewCookie = "", initialMenus = [] }: { preview?: boolean; previewCookie?: string; initialMenus?: MenuRow[] }) {
  const [menus, setMenus] = useState<MenuRow[]>(initialMenus);
  const [message, setMessage] = useState(preview ? "" : "메뉴 목록을 불러오는 중입니다.");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (preview) return;
      const response = await fetch("/api/admin/portal", { cache: "no-store" });
      const body = await response.json();
      if (cancelled) return;
      if (!response.ok) {
        setMessage(body.error ?? "불러오지 못했습니다.");
        return;
      }
      setMenus(body.menus ?? []);
      setMessage("");
    });
    return () => {
      cancelled = true;
    };
  }, [preview]);

  async function setLock(menu: MenuRow, locked: boolean) {
    if (menu.locked === locked) return;
    if (preview) {
      // 미리보기: 이 브라우저의 쿠키에만 적는다. 서버와 다른 사람 화면은 바뀌지 않는다.
      const next = menus.map((item) => (item.id === menu.id ? { ...item, locked } : item));
      const ids = next.filter((item) => item.locked && !item.fixed).map((item) => item.id).join(",");
      writePreviewLockCookie(previewCookie, ids);
      setMenus(next);
      setMessage(`(미리보기) ‘${menu.title}’ 메뉴를 ${locked ? "잠갔어요" : "열었어요"}. ‘직원 눈으로’ 바꿔 홈에 가면 이 브라우저에서만 그렇게 보여요.`);
      return;
    }
    setBusyId(menu.id);
    try {
      const response = await fetch("/api/admin/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sectionId: menu.id, locked }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error ?? "저장하지 못했습니다.");
        return;
      }
      setMenus(body.menus ?? []);
      setMessage(`‘${menu.title}’ 메뉴를 직원에게 ${locked ? "잠갔어요" : "열었어요"}.`);
    } catch {
      setMessage("연결이 끊겼어요. 다시 시도해 주세요.");
    } finally {
      setBusyId("");
    }
  }

  const groups = [...new Set(menus.map((menu) => menu.group))];
  const lockedCount = menus.filter((menu) => menu.locked).length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/">← 빈숲 OS 홈</Link>
        <h1>메뉴 잠금 설정</h1>
        <p>
          큰 메뉴마다 직원에게 <strong>열림</strong>으로 둘지 <strong>잠김</strong>으로 둘지 정해요. 잠긴 메뉴는 직원 화면에 ‘잠김’으로만 보이고,
          주소를 직접 열거나 챗봇으로 물어도 열리지 않아요. 사장님은 항상 들어갈 수 있어요. 시험처럼 계속 보이면 안 되는 메뉴는 평소엔 잠가 두고 필요할 때만 여세요.
        </p>
        {!message && <p className={styles.summary}>지금 잠긴 메뉴 <strong>{lockedCount}개</strong> · 열린 메뉴 {menus.length - lockedCount}개</p>}
      </header>

      {preview && <PreviewBanner what="메뉴 잠금 설정 (잠근 뒤 ‘직원 눈으로’ 바꾸면 잠긴 모습이 보여요)" role="owner" />}
      {message && <p className={styles.message} role="status">{message}</p>}

      {groups.map((group) => (
        <section key={group} className={styles.group}>
          <h2>{group}</h2>
          <ul>
            {menus.filter((menu) => menu.group === group).map((menu) => (
              <li key={menu.id} data-locked={menu.locked}>
                <div className={styles.name}>
                  <strong>{menu.title}</strong>
                  <small>
                    {menu.status === "soon" ? "준비 중인 메뉴 (미리 정해 둘 수 있어요)" : "지금 쓰는 메뉴"}
                    {menu.updatedAt && !menu.fixed ? ` · ${when(menu.updatedAt)} ${menu.updatedBy} 변경` : ""}
                  </small>
                </div>
                {menu.fixed ? (
                  <span className={styles.fixed}>서버 설정으로 고정 잠금</span>
                ) : (
                  <div className={styles.switch} role="group" aria-label={`${menu.title} 직원 공개 상태`}>
                    <button type="button" aria-pressed={!menu.locked} disabled={busyId === menu.id} onClick={() => void setLock(menu, false)}>열림</button>
                    <button type="button" aria-pressed={menu.locked} data-kind="lock" disabled={busyId === menu.id} onClick={() => void setLock(menu, true)}>잠김</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
