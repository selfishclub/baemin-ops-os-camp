import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuestProgressRow, QuestStatus } from "../app/quest/quest-data";

// 퀘스트 진행 기록 (표 quest_progress). 퀘스트 자체는 저장하지 않는다 — quest-data.ts 가 씨앗으로 매번 같은 걸 만든다.

export async function readQuestProgress(db: SupabaseClient, userId: string, weekStart: string): Promise<QuestProgressRow[]> {
  const { data, error } = await db
    .from("quest_progress")
    .select("quest_id, status, attempts, note, done_at, confirmed_at, confirmed_by")
    .eq("user_id", userId)
    .eq("week_start", weekStart);
  if (error) throw new Error(`퀘스트 기록을 읽지 못했습니다: ${error.message}`);
  return (data ?? []).map((row) => ({ quest_id: row.quest_id, status: row.status as QuestStatus, attempts: row.attempts, note: row.note, done_at: row.done_at, confirmed_at: row.confirmed_at }));
}

// 이 사람의 교육 기록: 만들어 봤음 메뉴 id, 읽었어요 문서 id (자동 완료 판정과 "아직 안 한 것 먼저" 고르기에 쓴다)
export async function readDoneSets(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from("training_checks").select("recipe_id, practiced_at").eq("user_id", userId).not("practiced_at", "is", null);
  if (error) throw new Error(`교육 기록을 읽지 못했습니다: ${error.message}`);
  const practicedRecipeIds = new Set<string>();
  const readDocIds = new Set<string>();
  for (const row of data ?? []) {
    const id = row.recipe_id as string;
    if (id.startsWith("manual:")) readDocIds.add(id.slice("manual:".length));
    else if (!id.startsWith("exam:")) practicedRecipeIds.add(id);
  }
  return { practicedRecipeIds, readDocIds };
}

// 문제 풀이: 맞으면 done, 틀리면 시도 횟수만 올린다
export async function recordAnswer(db: SupabaseClient, userId: string, weekStart: string, questId: string, correct: boolean, choice: string) {
  const { data: existing } = await db.from("quest_progress").select("attempts, status").eq("user_id", userId).eq("week_start", weekStart).eq("quest_id", questId).maybeSingle();
  if (existing?.status === "done" || existing?.status === "confirmed") return;
  const attempts = (existing?.attempts ?? 0) + 1;
  const { error } = await db.from("quest_progress").upsert(
    { user_id: userId, week_start: weekStart, quest_id: questId, status: correct ? "done" : "open", attempts, note: choice.slice(0, 120), done_at: correct ? new Date().toISOString() : null },
    { onConflict: "user_id,week_start,quest_id" },
  );
  if (error) throw new Error(`답을 저장하지 못했습니다: ${error.message}`);
}

// 미션: 글 쓰기(open, note) → 해냈어요(pending) → 사장 확인(confirmed)
export async function saveMission(db: SupabaseClient, userId: string, weekStart: string, note: string, claim: boolean) {
  const { data: existing } = await db.from("quest_progress").select("status, note").eq("user_id", userId).eq("week_start", weekStart).eq("quest_id", "mission").maybeSingle();
  if (existing?.status === "confirmed") return;
  const text = (note || existing?.note || "").trim().slice(0, 200);
  if (!text) throw new Error("적용할 것을 한 줄 적어 주세요.");
  const { error } = await db.from("quest_progress").upsert(
    { user_id: userId, week_start: weekStart, quest_id: "mission", status: claim ? "pending" : "open", note: text, done_at: claim ? new Date().toISOString() : null },
    { onConflict: "user_id,week_start,quest_id" },
  );
  if (error) throw new Error(`미션을 저장하지 못했습니다: ${error.message}`);
}

export type PendingMission = { user_id: string; user_name: string; week_start: string; note: string; done_at: string | null; status: QuestStatus };

// 사장용: 확인 기다리는 미션 + 최근 확인한 것
export async function readMissions(db: SupabaseClient, weeks: string[]): Promise<PendingMission[]> {
  const { data, error } = await db
    .from("quest_progress")
    .select("user_id, week_start, note, done_at, status, profiles:user_id (display_name, login_id)")
    .eq("quest_id", "mission")
    .in("week_start", weeks)
    .in("status", ["pending", "confirmed"])
    .order("done_at", { ascending: false });
  if (error) throw new Error(`미션 목록을 읽지 못했습니다: ${error.message}`);
  return (data ?? []).map((row) => {
    const profile = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as { display_name: string; login_id: string } | null;
    return { user_id: row.user_id, user_name: profile?.display_name || profile?.login_id || "", week_start: row.week_start, note: row.note, done_at: row.done_at, status: row.status as QuestStatus };
  });
}

export async function confirmMission(db: SupabaseClient, ownerId: string, userId: string, weekStart: string) {
  const { error } = await db
    .from("quest_progress")
    .update({ status: "confirmed", confirmed_by: ownerId, confirmed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .eq("quest_id", "mission")
    .eq("status", "pending");
  if (error) throw new Error(`미션을 확인하지 못했습니다: ${error.message}`);
}
