import type { SupabaseClient } from "@supabase/supabase-js";
import { readPublishedContent } from "./recipe-store";
import { readableManuals } from "../app/manual/manual-data";
import { getTrainingPath, manualCheckPrefix } from "../app/manual/training-path";

// 신입 메뉴 체크리스트 · 레시피 퀴즈 저장 층
// 표: training_checks (직원×메뉴: 만들어 봤음 / 사장 확인함), quiz_results (퀴즈 점수)
// 매뉴얼 문서·응대 카드의 "읽었어요 / 확인함"도 같은 표에 적는다 — recipe_id 칸에 "manual:<문서 id>" 로.

export type TrainingRow = {
  recipe_id: string;
  recipe_name: string;
  category: string;
  practiced_at: string | null;
  confirmed_at: string | null;
  confirmed_by_name: string | null;
};

type CheckRow = {
  user_id: string;
  recipe_id: string;
  practiced_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
};

async function readChecks(db: SupabaseClient, userId: string): Promise<CheckRow[]> {
  const { data, error } = await db
    .from("training_checks")
    .select("user_id, recipe_id, practiced_at, confirmed_by, confirmed_at")
    .eq("user_id", userId);
  if (error) throw new Error(`체크리스트를 읽지 못했습니다: ${error.message}`);
  return (data ?? []) as CheckRow[];
}

async function readNames(db: SupabaseClient, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const { data } = await db.from("profiles").select("id, login_id, display_name").in("id", unique);
  return new Map((data ?? []).map((row) => [row.id as string, (row.display_name || row.login_id) as string]));
}

// 한 직원의 체크리스트: 공식 레시피 전체 × 그 직원의 기록
// allowedSectionIds 를 주면 그 영역의 매뉴얼만 돌려준다 (직원에게 잠긴 영역의 문서가 교육 화면으로 새지 않게)
export async function readTraining(db: SupabaseClient, userId: string, allowedSectionIds?: Set<string>) {
  const [content, checks] = await Promise.all([readPublishedContent(db), readChecks(db, userId)]);
  const byRecipe = new Map(checks.map((row) => [row.recipe_id, row]));
  const names = await readNames(db, checks.map((row) => row.confirmed_by ?? ""));
  const rows: TrainingRow[] = content.recipes.map((recipe) => {
    const row = byRecipe.get(recipe.id);
    return {
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      category: recipe.category,
      practiced_at: row?.practiced_at ?? null,
      confirmed_at: row?.confirmed_at ?? null,
      confirmed_by_name: row?.confirmed_by ? names.get(row.confirmed_by) ?? null : null,
    };
  });
  const docChecks = Object.fromEntries(
    checks
      .filter((row) => row.recipe_id.startsWith(manualCheckPrefix))
      .map((row) => [row.recipe_id.slice(manualCheckPrefix.length), { practiced_at: row.practiced_at, confirmed_at: row.confirmed_at, confirmed_by_name: row.confirmed_by ? names.get(row.confirmed_by) ?? null : null }]),
  );
  return {
    rows,
    total: rows.length,
    practiced: rows.filter((row) => row.practiced_at).length,
    confirmed: rows.filter((row) => row.confirmed_at).length,
    // 신입 교육 경로와 거기에 들어가는 매뉴얼 문서·응대 카드, 문서별 읽음/확인 기록
    path: getTrainingPath(content),
    manuals: readableManuals(content).filter((doc) => !allowedSectionIds || allowedSectionIds.has(doc.sectionId)),
    docChecks,
  };
}

// 직원이 "만들어 봤음" (누르면 기록, 다시 누르면 취소)
export async function togglePracticed(db: SupabaseClient, userId: string, recipeId: string) {
  const { data: existing } = await db
    .from("training_checks")
    .select("practiced_at")
    .eq("user_id", userId)
    .eq("recipe_id", recipeId)
    .maybeSingle();
  const practicedAt = existing?.practiced_at ? null : new Date().toISOString();
  const { error } = await db
    .from("training_checks")
    .upsert({ user_id: userId, recipe_id: recipeId, practiced_at: practicedAt }, { onConflict: "user_id,recipe_id" });
  if (error) throw new Error(`기록하지 못했습니다: ${error.message}`);
}

// 사장이 "확인함" (누르면 기록, 다시 누르면 취소)
export async function toggleConfirmed(db: SupabaseClient, ownerId: string, userId: string, recipeId: string) {
  const { data: existing } = await db
    .from("training_checks")
    .select("confirmed_at, practiced_at")
    .eq("user_id", userId)
    .eq("recipe_id", recipeId)
    .maybeSingle();
  const confirm = !existing?.confirmed_at;
  const { error } = await db
    .from("training_checks")
    .upsert(
      {
        user_id: userId,
        recipe_id: recipeId,
        practiced_at: existing?.practiced_at ?? null,
        confirmed_by: confirm ? ownerId : null,
        confirmed_at: confirm ? new Date().toISOString() : null,
      },
      { onConflict: "user_id,recipe_id" },
    );
  if (error) throw new Error(`확인을 저장하지 못했습니다: ${error.message}`);
}

export type QuizAnswer = { question: string; answer: string; chosen: string; correct: boolean };

export async function saveQuizResult(db: SupabaseClient, userId: string, score: number, total: number, detail: QuizAnswer[]) {
  const { error } = await db.from("quiz_results").insert({ user_id: userId, score, total, detail_json: detail });
  if (error) throw new Error(`퀴즈 결과를 저장하지 못했습니다: ${error.message}`);
}

export async function readMyQuizHistory(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("quiz_results")
    .select("id, score, total, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`퀴즈 기록을 읽지 못했습니다: ${error.message}`);
  return data ?? [];
}

// 사장용: 직원별 진행률과 최근 퀴즈 점수
export async function readTrainingOverview(db: SupabaseClient) {
  const [content, staffResult, checksResult, quizResult] = await Promise.all([
    readPublishedContent(db),
    db.from("profiles").select("id, login_id, display_name, role, active").order("created_at", { ascending: true }),
    db.from("training_checks").select("user_id, recipe_id, practiced_at, confirmed_at"),
    db.from("quiz_results").select("user_id, score, total, created_at").order("created_at", { ascending: false }).limit(300),
  ]);
  if (staffResult.error) throw new Error(`직원 목록을 읽지 못했습니다: ${staffResult.error.message}`);
  if (checksResult.error) throw new Error(`체크리스트를 읽지 못했습니다: ${checksResult.error.message}`);
  if (quizResult.error) throw new Error(`퀴즈 기록을 읽지 못했습니다: ${quizResult.error.message}`);
  const total = content.recipes.length;
  const latestQuiz = new Map<string, { score: number; total: number; created_at: string }>();
  for (const row of quizResult.data ?? []) if (!latestQuiz.has(row.user_id)) latestQuiz.set(row.user_id, row);
  return {
    total,
    staff: (staffResult.data ?? []).map((person) => {
      const all = (checksResult.data ?? []).filter((row) => row.user_id === person.id);
      // 메뉴 기록과 매뉴얼 문서 기록("manual:" 로 시작)을 따로 센다
      const mine = all.filter((row) => !row.recipe_id.startsWith(manualCheckPrefix));
      const docs = all.filter((row) => row.recipe_id.startsWith(manualCheckPrefix));
      return {
        id: person.id,
        name: person.display_name || person.login_id,
        role: person.role,
        active: person.active,
        practiced: mine.filter((row) => row.practiced_at).length,
        confirmed: mine.filter((row) => row.confirmed_at).length,
        docsRead: docs.filter((row) => row.practiced_at).length,
        docsConfirmed: docs.filter((row) => row.confirmed_at).length,
        quiz: latestQuiz.get(person.id) ?? null,
      };
    }),
  };
}
