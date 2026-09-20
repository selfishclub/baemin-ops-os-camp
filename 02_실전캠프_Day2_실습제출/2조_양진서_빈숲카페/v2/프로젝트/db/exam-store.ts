import type { SupabaseClient } from "@supabase/supabase-js";
import { buildExamStatus, examCheckPrefix, getExams } from "../app/exam/exam-data";
import { readPublishedContent } from "./recipe-store";

// 시험 · 인증 저장 층. 새 표를 만들지 않고 기존 두 표를 쓴다.
//  - 필기 결과: quiz_results (detail_json = { examId, answers }) — 연습 퀴즈는 detail_json 이 배열이라 구분된다
//  - 실기 항목: training_checks (recipe_id = "exam:<시험 id>:<항목 id>"). practiced_at = 직원의 "볼 준비 됐어요",
//    confirmed_at = 사장의 합격 처리. 직원이 confirmed 칸을 못 바꾸게 막는 창고 트리거(guard_training_confirm)가 그대로 지켜 준다.

type ResultRow = { user_id: string; score: number; total: number; created_at: string; detail_json: unknown };

function examIdOf(detail: unknown): string | null {
  if (!detail || Array.isArray(detail) || typeof detail !== "object") return null;
  const value = (detail as { examId?: unknown }).examId;
  return typeof value === "string" ? value : null;
}

async function readNames(db: SupabaseClient, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const { data } = await db.from("profiles").select("id, login_id, display_name").in("id", unique);
  return new Map((data ?? []).map((row) => [row.id as string, (row.display_name || row.login_id) as string]));
}

// 한 사람의 시험 상태
export async function readExamStatus(db: SupabaseClient, userId: string) {
  const [content, resultsQuery, checksQuery] = await Promise.all([
    readPublishedContent(db),
    db.from("quiz_results").select("user_id, score, total, created_at, detail_json").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
    db.from("training_checks").select("recipe_id, practiced_at, confirmed_by, confirmed_at").eq("user_id", userId).like("recipe_id", `${examCheckPrefix}%`),
  ]);
  if (resultsQuery.error) throw new Error(`시험 결과를 읽지 못했습니다: ${resultsQuery.error.message}`);
  if (checksQuery.error) throw new Error(`실기 기록을 읽지 못했습니다: ${checksQuery.error.message}`);
  const names = await readNames(db, (checksQuery.data ?? []).map((row) => (row.confirmed_by as string | null) ?? ""));
  const results = ((resultsQuery.data ?? []) as ResultRow[]).flatMap((row) => {
    const examId = examIdOf(row.detail_json);
    return examId ? [{ examId, score: row.score, total: row.total, created_at: row.created_at }] : [];
  });
  const checks = (checksQuery.data ?? []).map((row) => ({
    recipe_id: row.recipe_id as string,
    practiced_at: row.practiced_at as string | null,
    confirmed_at: row.confirmed_at as string | null,
    confirmed_by_name: row.confirmed_by ? names.get(row.confirmed_by as string) ?? null : null,
  }));
  return { exams: buildExamStatus(getExams(content), results, checks) };
}

export async function saveWrittenResult(db: SupabaseClient, userId: string, examId: string, score: number, total: number, answers: unknown[]) {
  const { error } = await db.from("quiz_results").insert({ user_id: userId, score, total, detail_json: { examId, answers } });
  if (error) throw new Error(`시험 결과를 저장하지 못했습니다: ${error.message}`);
}

// 사장용: 직원별로 단계마다 어디까지 왔는지
export async function readExamOverview(db: SupabaseClient) {
  const { data: staff, error } = await db.from("profiles").select("id, login_id, display_name, role, active").order("created_at", { ascending: true });
  if (error) throw new Error(`직원 목록을 읽지 못했습니다: ${error.message}`);
  const people = await Promise.all(
    (staff ?? []).filter((person) => person.active).map(async (person) => {
      const status = await readExamStatus(db, person.id as string);
      return {
        id: person.id as string,
        name: (person.display_name || person.login_id) as string,
        role: person.role as string,
        exams: status.exams.map((exam) => ({ id: exam.id, best: exam.best, writtenPassed: exam.writtenPassed, practicalPassed: exam.practical.filter((item) => item.passed_at).length, practicalTotal: exam.practical.length, waiting: exam.practical.filter((item) => item.ready_at && !item.passed_at).length, certified: exam.certified })),
      };
    }),
  );
  const content = await readPublishedContent(db);
  return { exams: getExams(content).map((exam) => ({ id: exam.id, title: exam.title })), staff: people };
}
