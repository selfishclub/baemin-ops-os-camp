import type { SupabaseClient } from "@supabase/supabase-js";
import type { ViewerSession } from "../app/auth";

// 영역 잠금: 사장이 빈숲 OS 홈에서 영역(레시피 등)을 평상시에 잠가 둘 수 있다.
// 잠긴 영역은 직원에게 "잠김"으로만 보이고, 주소를 직접 열거나 챗봇으로 물어도 열리지 않는다. 사장은 항상 들어갈 수 있다.
//
// 잠금은 두 군데서 온다.
//  1) 데이터 창고 표 portal_locks — 사장이 홈에서 누르는 잠그기/열기 (로그인 모드)
//  2) 서버 환경변수 LOCKED_SECTIONS="recipes,training" — 둘러보기 모드처럼 로그인이 꺼져 있을 때도 걸 수 있는 고정 잠금

export const lockableSections = ["recipes", "training"] as const;
export type LockableSection = (typeof lockableSections)[number];

function envLocks(): string[] {
  return (process.env.LOCKED_SECTIONS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

export async function readLockedSections(db: SupabaseClient | null): Promise<Set<string>> {
  const locked = new Set(envLocks());
  if (!db) return locked;
  const { data, error } = await db.from("portal_locks").select("section_id, locked");
  if (error) {
    // 표가 아직 없거나 읽지 못하면 환경변수 잠금만 적용한다 (화면이 죽지 않게)
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

export type SectionAccess = { locked: boolean; allowed: boolean; envLocked: boolean };

// 이 사람이 이 영역에 들어갈 수 있나. 잠겨 있어도 사장은 들어간다.
export async function checkSectionAccess(session: ViewerSession, sectionId: string): Promise<SectionAccess> {
  const locked = await readLockedSections(session.mode === "auth" ? session.db : null);
  const isLocked = locked.has(sectionId);
  const isOwner = session.mode === "auth" && session.viewer?.role === "owner";
  return { locked: isLocked, allowed: !isLocked || isOwner, envLocked: envLocks().includes(sectionId) };
}

export function lockedResponse() {
  return Response.json({ error: "이 영역은 지금 잠겨 있습니다. 필요하면 매장 책임자에게 열어 달라고 요청해 주세요.", locked: true }, { status: 423 });
}
