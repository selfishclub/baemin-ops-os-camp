import type { SupabaseClient } from "@supabase/supabase-js";
import type { ViewerSession } from "../app/auth";
import { portalSections } from "../app/portal-sections";
import { cookies } from "next/headers";
import { readPreviewRole } from "../app/preview/preview-role";

// 메뉴(영역) 잠금: 사장이 관리자 화면 "메뉴 잠금 설정"에서 큰 메뉴마다 열림/잠김을 정한다.
// 잠긴 메뉴는 직원에게 "잠김"으로만 보이고, 주소를 직접 열거나 챗봇으로 물어도 열리지 않는다. 사장은 항상 들어갈 수 있다.
// 아직 "준비 중"인 메뉴(시험·인증 등)도 미리 잠가 둘 수 있다 — 나중에 그 화면이 생기면 checkSectionAccess 로 막는다.
//
// 잠금은 두 군데서 온다.
//  1) 데이터 창고 표 portal_locks — 사장이 관리자 화면에서 정한 것 (로그인 모드)
//  2) 서버 환경변수 LOCKED_SECTIONS="recipes,exam" — 로그인이 꺼진 둘러보기 모드에서도 걸 수 있는 고정 잠금

// 사장 전용 관리 메뉴는 원래 직원에게 안 보이므로 잠금 대상이 아니다
export const lockableSections: string[] = portalSections.filter((section) => !section.ownerOnly).map((section) => section.id);

export function envLockedSections(): string[] {
  return (process.env.LOCKED_SECTIONS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

export const previewLockCookie = "bs_preview_locks";

// 시연·둘러보기 모드(로그인 없음)에서만: 이 브라우저의 쿠키에 적어 둔 미리보기 잠금. 다른 사람에게는 영향이 없다.
async function previewLocks(): Promise<string[]> {
  try {
    const value = (await cookies()).get(previewLockCookie)?.value ?? "";
    return decodeURIComponent(value).split(",").map((item) => item.trim()).filter((item) => lockableSections.includes(item));
  } catch {
    return [];
  }
}

export async function readLockedSections(db: SupabaseClient | null): Promise<Set<string>> {
  const locked = new Set(envLockedSections());
  if (!db) {
    for (const id of await previewLocks()) locked.add(id);
    return locked;
  }
  const { data, error } = await db.from("portal_locks").select("section_id, locked");
  if (error) {
    // 표를 읽지 못하면 환경변수 잠금만 적용한다 (화면이 죽지 않게)
    console.error("[portal] 잠금 상태를 읽지 못했습니다:", error.message);
    return locked;
  }
  for (const row of data ?? []) if (row.locked) locked.add(row.section_id as string);
  return locked;
}

export async function setSectionLock(db: SupabaseClient, actorName: string, sectionId: string, locked: boolean) {
  const { error } = await db
    .from("portal_locks")
    .upsert({ section_id: sectionId, locked, updated_by: actorName, updated_at: new Date().toISOString() }, { onConflict: "section_id" });
  if (error) throw new Error(`잠금 상태를 저장하지 못했습니다: ${error.message}`);
}

// 관리자 화면용: 메뉴마다 지금 상태와 마지막으로 바꾼 사람·시각
export async function readMenuLockTable(db: SupabaseClient) {
  const { data, error } = await db.from("portal_locks").select("section_id, locked, updated_by, updated_at");
  if (error) throw new Error(`잠금 상태를 읽지 못했습니다: ${error.message}`);
  const rows = new Map((data ?? []).map((row) => [row.section_id as string, row]));
  const fixed = new Set(envLockedSections());
  return portalSections
    .filter((section) => !section.ownerOnly)
    .map((section) => {
      const row = rows.get(section.id);
      return {
        id: section.id,
        title: section.title,
        group: section.group,
        status: section.status,
        locked: fixed.has(section.id) || Boolean(row?.locked),
        fixed: fixed.has(section.id),
        updatedBy: (row?.updated_by as string | undefined) ?? "",
        updatedAt: (row?.updated_at as string | undefined) ?? "",
      };
    });
}

// 미리보기용 표: 데이터 창고 없이 메뉴 목록과 지금(쿠키+서버 설정) 잠금 상태
export async function readPreviewMenuTable() {
  const locked = await readLockedSections(null);
  const fixed = new Set(envLockedSections());
  return portalSections
    .filter((section) => !section.ownerOnly)
    .map((section) => ({ id: section.id, title: section.title, group: section.group, status: section.status, locked: locked.has(section.id), fixed: fixed.has(section.id), updatedBy: "", updatedAt: "" }));
}

export type SectionAccess = { locked: boolean; allowed: boolean; envLocked: boolean };

// 이 사람이 이 메뉴에 들어갈 수 있나. 잠겨 있어도 사장은 들어간다.
export async function checkSectionAccess(session: ViewerSession, sectionId: string): Promise<SectionAccess> {
  const locked = await readLockedSections(session.mode === "auth" ? session.db : null);
  const isLocked = locked.has(sectionId);
  const envLocked = envLockedSections().includes(sectionId);
  const isOwner = session.mode === "auth" && session.viewer?.role === "owner";
  // 미리보기에서 "사장 눈으로" 보는 중이면 미리보기(쿠키) 잠금은 사장처럼 지나간다. 서버 설정 고정 잠금은 누구도 못 지나간다.
  const previewOwner = session.mode === "demo" && !envLocked && (await readPreviewRole()) === "owner";
  return { locked: isLocked, allowed: !isLocked || isOwner || previewOwner, envLocked };
}

export function lockedResponse() {
  return Response.json({ error: "이 메뉴는 지금 잠겨 있습니다. 필요하면 매장 책임자에게 열어 달라고 요청해 주세요.", locked: true }, { status: 423 });
}
