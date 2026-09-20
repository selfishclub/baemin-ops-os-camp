import Link from "next/link";
import { requireActiveViewer } from "./auth";
import { portalSections, type PortalSection } from "./portal-sections";
import { envLockedSections, readLockedSections } from "../db/portal-store";
import { readPreviewRole } from "./preview/preview-role";
import PreviewRoleSwitch from "./preview/preview-role-switch";
import styles from "./portal.module.css";

export const dynamic = "force-dynamic";

// 빈숲 OS 홈 — 전체 매뉴얼 포털의 첫 화면. 접속하면 내용이 아니라 영역별 큰 버튼이 먼저 보인다.
// 레시피는 그중 한 영역(/recipes). 사장은 영역을 평상시에 잠가 둘 수 있다.
export default async function PortalHome() {
  const session = await requireActiveViewer("/");
  const viewer = session.viewer;
  const demo = session.mode === "demo";
  // 미리보기(로그인 꺼짐)에서는 "직원 눈으로 / 사장 눈으로" 단추로 고른 쪽으로 보여 준다
  const previewRole = demo ? await readPreviewRole() : null;
  const isOwner = demo ? previewRole === "owner" : viewer?.role === "owner";
  const locked = await readLockedSections(session.mode === "auth" ? session.db : null);
  const fixedLocks = new Set(demo ? envLockedSections() : []);
  const visible = portalSections.filter((section) => !section.ownerOnly || isOwner);
  const groups = [...new Set(visible.map((section) => section.group))];

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">B</span>
          <div>
            <p>BEANSOOP · OPERATING SYSTEM</p>
            <h1>빈숲 OS</h1>
          </div>
        </div>
        <div className={styles.headerActions}>
          <p>
            {demo
              ? process.env.NEXT_PUBLIC_LOGIN_OFF === "1" ? "둘러보기 모드 · 로그인 꺼 둠 · 가짜 데이터" : "시연 모드 · 가짜 데이터"
              : viewer ? `${viewer.displayName}님 · ${isOwner ? "사장" : "직원"}` : ""}
          </p>
          {previewRole && <PreviewRoleSwitch role={previewRole} />}
          {viewer && (
            <form action="/api/auth/logout" method="post">
              <button type="submit">로그아웃</button>
            </form>
          )}
        </div>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>KNOW · DO · RECORD</p>
        <h2>물어보지 않아도 알고, 실행하고, 기록하는 매장.</h2>
        <p>필요한 영역을 고르세요. ‘준비 중’은 자리만 잡아 둔 곳이고, ‘잠김’은 매장 책임자가 열어 줄 때만 볼 수 있어요.</p>
      </section>

      {groups.map((group) => (
        <section key={group} className={styles.group} aria-labelledby={`group-${group}`}>
          <h3 id={`group-${group}`}>{group}</h3>
          <div className={styles.grid}>
            {visible.filter((section) => section.group === group).map((section) => {
              return <Tile key={section.id} section={section} locked={locked.has(section.id)} bypass={Boolean(isOwner) && !fixedLocks.has(section.id)} />;
            })}
          </div>
        </section>
      ))}
    </main>
  );
}

function Tile({ section, locked, bypass }: { section: PortalSection; locked: boolean; bypass: boolean }) {
  const state = section.status === "soon" ? "soon" : locked ? "locked" : "open";
  const label = state === "soon" ? (locked && bypass ? "준비 중 · 잠금 예약" : "준비 중") : state === "locked" ? (bypass ? "잠김 · 사장만 열림" : "잠김") : "열기";
  const body = (
    <>
      <span className={styles.tileStatus} data-status={state}>{label}</span>
      <strong>{section.title}</strong>
      <span className={styles.tileDesc}>{section.description}</span>
    </>
  );
  const canOpen = section.href && (state === "open" || (state === "locked" && bypass));
  if (canOpen) return <Link className={styles.tile} href={section.href!} data-status={state}>{body}</Link>;
  return <div className={styles.tile} data-status={state} aria-disabled="true">{body}</div>;
}
