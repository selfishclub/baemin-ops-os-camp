"use client";

import type { Recipe, RecipeContent } from "../recipes/recipe-data";
import { manualNoticePrefix, readableManuals } from "../manual/manual-data";
import { getTrainingPath, manualCheckPrefix } from "../manual/training-path";
import { buildExamStatus, examCheckKey, examCheckPrefix, getExams } from "../exam/exam-data";

// 미리보기용 "사람" 데이터: 가짜 직원, 메뉴 체크리스트, 퀴즈 점수, 바뀐 레시피 알림과 확인 기록.
// 전부 이 브라우저(localStorage)에만 있고 서버·데이터 창고로 가는 길은 없다. 실제 직원 이름은 쓰지 않는다.

// 예시 기록의 모양이 바뀌면 숫자를 올린다 — 예전 버전을 눌러 본 브라우저에 남은 옛 예시가 새 화면을 가리지 않게
const storageKey = "beansoop-preview-people-v3";
const oldStorageKeys = ["beansoop-preview-people-v1", "beansoop-preview-people-v2"];
const roleCookie = "bs_preview_role";

const ownerId = "preview-owner";
const staffId = "preview-staff-a";

type StaffRow = { id: string; login_id: string; display_name: string; role: "owner" | "staff"; active: boolean; created_at: string };
type CheckRow = { user_id: string; recipe_id: string; practiced_at: string | null; confirmed_at: string | null; confirmed_by: string | null };
// examId 가 있으면 시험 필기 결과, 없으면 연습 퀴즈
type QuizRow = { id: number; user_id: string; score: number; total: number; created_at: string; examId?: string };
type NoticeRow = { id: number; version: number; recipe_id: string; recipe_name: string; change_reason: string; published_by: string; created_at: string; acks: { user_id: string; acked_at: string }[] };
type PreviewPeople = { staff: StaffRow[]; checks: CheckRow[]; quiz: QuizRow[]; notices: NoticeRow[] };

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// 처음 열었을 때 화면이 비어 보이지 않게 넣어 두는 가짜 기록
function freshPeople(recipes: Recipe[]): PreviewPeople {
  const [first, second, third] = recipes;
  return {
    staff: [
      { id: ownerId, login_id: "owner", display_name: "미리보기 사장", role: "owner", active: true, created_at: daysAgo(90) },
      { id: staffId, login_id: "staff-a", display_name: "직원 A", role: "staff", active: true, created_at: daysAgo(30) },
      { id: "preview-staff-b", login_id: "staff-b", display_name: "직원 B", role: "staff", active: true, created_at: daysAgo(20) },
      { id: "preview-staff-c", login_id: "staff-c", display_name: "직원 C", role: "staff", active: false, created_at: daysAgo(60) },
    ],
    checks: [
      ...(first ? [{ user_id: staffId, recipe_id: first.id, practiced_at: daysAgo(5), confirmed_at: daysAgo(4), confirmed_by: ownerId }] : []),
      ...(second ? [{ user_id: staffId, recipe_id: second.id, practiced_at: daysAgo(2), confirmed_at: null, confirmed_by: null }] : []),
      ...(first ? [{ user_id: "preview-staff-b", recipe_id: first.id, practiced_at: daysAgo(9), confirmed_at: daysAgo(8), confirmed_by: ownerId }] : []),
      { user_id: "preview-staff-b", recipe_id: examCheckKey("demo-exam-1", "p1"), practiced_at: daysAgo(7), confirmed_at: daysAgo(6), confirmed_by: ownerId },
      { user_id: "preview-staff-b", recipe_id: examCheckKey("demo-exam-1", "p2"), practiced_at: daysAgo(7), confirmed_at: daysAgo(6), confirmed_by: ownerId },
      { user_id: "preview-staff-b", recipe_id: examCheckKey("demo-exam-1", "p3"), practiced_at: daysAgo(1), confirmed_at: null, confirmed_by: null },
      // 매뉴얼 문서 읽음 기록 (교육 경로 1일차의 예시 문서)
      { user_id: staffId, recipe_id: `${manualCheckPrefix}demo-standard-motto`, practiced_at: daysAgo(6), confirmed_at: daysAgo(5), confirmed_by: ownerId },
      { user_id: staffId, recipe_id: `${manualCheckPrefix}demo-hygiene-daily`, practiced_at: daysAgo(6), confirmed_at: null, confirmed_by: null },
    ],
    quiz: [
      { id: 1, user_id: "preview-staff-b", score: 8, total: 10, created_at: daysAgo(3) },
      // 시험 예시: 직원 B는 1단계 필기 합격 + 실기 2/3, 직원 A는 필기 한 번 떨어짐
      { id: 2, user_id: "preview-staff-b", score: 9, total: 10, created_at: daysAgo(7), examId: "demo-exam-1" },
      { id: 3, user_id: staffId, score: 6, total: 10, created_at: daysAgo(4), examId: "demo-exam-1" },
    ],
    notices: third
      ? [{ id: 2, version: 1, recipe_id: `${manualNoticePrefix}demo-close-closing`, recipe_name: "예시 · 마감 순서", change_reason: "시연용 알림 · 순서 변경", published_by: "미리보기 사장", created_at: daysAgo(2), acks: [] }, { id: 1, version: 1, recipe_id: third.id, recipe_name: third.name, change_reason: "시연용 알림 · 정량 변경", published_by: "미리보기 사장", created_at: daysAgo(1), acks: [{ user_id: "preview-staff-b", acked_at: daysAgo(0.5) }] }]
      : [],
  };
}

function load(recipes: Recipe[]): PreviewPeople {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) return JSON.parse(raw) as PreviewPeople;
  } catch {
    // 저장소를 못 쓰는 브라우저면 매번 새로 시작한다
  }
  return freshPeople(recipes);
}

function save(people: PreviewPeople) {
  try {
    people.notices = people.notices.slice(-30);
    people.quiz = people.quiz.slice(-40);
    window.localStorage.setItem(storageKey, JSON.stringify(people));
  } catch {
    // 공간이 모자라면 저장을 건너뛴다
  }
}

export function hasPeopleEdits() {
  try {
    return Boolean(window.localStorage.getItem(storageKey));
  } catch {
    return false;
  }
}

export function resetPeople() {
  try {
    window.localStorage.removeItem(storageKey);
    for (const key of oldStorageKeys) window.localStorage.removeItem(key);
  } catch {
    // 무시
  }
}

// 지금 미리보기를 누구 눈으로 보고 있나 (서버의 preview-role.ts 와 같은 쿠키)
function currentRole(): "owner" | "staff" {
  return document.cookie.split("; ").includes(`${roleCookie}=staff`) ? "staff" : "owner";
}

// 미리보기 잠금 쿠키에 적힌 영역 (db/portal-store.ts 의 bs_preview_locks)
function previewLockedSections(): string[] {
  const item = document.cookie.split("; ").find((entry) => entry.startsWith("bs_preview_locks="));
  return item ? decodeURIComponent(item.slice("bs_preview_locks=".length)).split(",").filter(Boolean) : [];
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ownerOnly = () => json({ error: "사장님 계정만 볼 수 있습니다. (미리보기: ‘사장 눈으로’로 바꿔 보세요)" }, 403);

function nameOf(people: PreviewPeople, id: string | null) {
  const person = people.staff.find((row) => row.id === id);
  return person ? person.display_name || person.login_id : null;
}

function trainingOf(people: PreviewPeople, content: RecipeContent, userId: string) {
  const recipes = content.recipes;
  const mine = new Map(people.checks.filter((row) => row.user_id === userId).map((row) => [row.recipe_id, row]));
  const rows = recipes.map((recipe) => {
    const row = mine.get(recipe.id);
    return {
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      category: recipe.category,
      practiced_at: row?.practiced_at ?? null,
      confirmed_at: row?.confirmed_at ?? null,
      confirmed_by_name: row?.confirmed_by ? nameOf(people, row.confirmed_by) : null,
    };
  });
  const docChecks = Object.fromEntries(
    people.checks
      .filter((row) => row.user_id === userId && row.recipe_id.startsWith(manualCheckPrefix))
      .map((row) => [row.recipe_id.slice(manualCheckPrefix.length), { practiced_at: row.practiced_at, confirmed_at: row.confirmed_at, confirmed_by_name: row.confirmed_by ? nameOf(people, row.confirmed_by) : null }]),
  );
  return {
    rows,
    total: rows.length,
    practiced: rows.filter((row) => row.practiced_at).length,
    confirmed: rows.filter((row) => row.confirmed_at).length,
    path: getTrainingPath(content),
    manuals: readableManuals(content),
    docChecks,
  };
}

function quizOf(people: PreviewPeople, userId: string) {
  return people.quiz.filter((row) => row.user_id === userId && !row.examId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10).map(({ id, score, total, created_at }) => ({ id, score, total, created_at }));
}

function checkFor(people: PreviewPeople, userId: string, recipeId: string) {
  let row = people.checks.find((item) => item.user_id === userId && item.recipe_id === recipeId);
  if (!row) {
    row = { user_id: userId, recipe_id: recipeId, practiced_at: null, confirmed_at: null, confirmed_by: null };
    people.checks.push(row);
  }
  return row;
}

// 서버의 db/notice-view.ts 와 같은 규칙: 레시피·매뉴얼 알림을 한 목록으로, 잠긴 영역·지워진 문서의 것은 뺀다
function myNotices(people: PreviewPeople, content: RecipeContent, userId: string, lockedSections: string[]) {
  const sectionOf = new Map(readableManuals(content).map((doc) => [doc.id, doc.sectionId]));
  const items = [...people.notices]
    .reverse()
    .map(({ acks, ...notice }) => {
      const acked = acks.some((ack) => ack.user_id === userId);
      if (!notice.recipe_id.startsWith(manualNoticePrefix)) return lockedSections.includes("recipes") ? null : { ...notice, acked, kind: "recipe" as const, href: "/recipes" };
      const docId = notice.recipe_id.slice(manualNoticePrefix.length);
      const sectionId = sectionOf.get(docId);
      return sectionId && !lockedSections.includes(sectionId) ? { ...notice, acked, kind: "manual" as const, href: `/manual/${sectionId}?doc=${encodeURIComponent(docId)}` } : null;
    })
    .filter((item) => item !== null);
  return { notices: items, pending: items.filter((item) => !item.acked).length };
}

// 미리보기에서 게시했을 때: 바뀐 메뉴마다 알림을 만든다 (실제 서버의 publishDraft 와 같은 규칙)
export function addPreviewNotices(recipes: Recipe[], changed: { id: string; name: string }[], version: number, reason: string, publishedBy: string) {
  if (!changed.length) return;
  const people = load(recipes);
  let nextId = Math.max(0, ...people.notices.map((notice) => notice.id)) + 1;
  const now = new Date().toISOString();
  for (const item of changed) {
    people.notices.push({ id: nextId++, version, recipe_id: item.id, recipe_name: item.name, change_reason: reason, published_by: publishedBy, created_at: now, acks: [] });
  }
  save(people);
}

export async function handlePeople(path: string, method: string, url: string, body: Record<string, unknown>, content: RecipeContent): Promise<Response | null> {
  const recipes = content.recipes;
  const role = currentRole();
  const me = role === "owner" ? ownerId : staffId;

  // 바뀐 레시피: 내 목록 / 확인했어요 / 사장용 확인 현황
  const lockedForMe = role === "staff" ? previewLockedSections() : [];
  if (path === "/api/changes" && method === "GET") return json(myNotices(load(recipes), content, me, lockedForMe));

  if (path === "/api/changes/ack" && method === "POST") {
    const people = load(recipes);
    const notice = people.notices.find((item) => item.id === Number(body.noticeId));
    if (!notice) return json({ error: "어떤 알림인지 없습니다." }, 400);
    if (!notice.acks.some((ack) => ack.user_id === me)) notice.acks.push({ user_id: me, acked_at: new Date().toISOString() });
    save(people);
    return json(myNotices(people, content, me, lockedForMe));
  }

  if (path === "/api/admin/changes" && method === "GET") {
    if (role !== "owner") return ownerOnly();
    const people = load(recipes);
    const active = people.staff.filter((person) => person.active);
    return json({
      staff: people.staff,
      notices: [...people.notices].reverse().map(({ acks, ...notice }) => ({
        ...notice,
        acked: active.filter((person) => acks.some((ack) => ack.user_id === person.id)).map((person) => ({ id: person.id, name: person.display_name, at: acks.find((ack) => ack.user_id === person.id)?.acked_at ?? "" })),
        pending: active.filter((person) => !acks.some((ack) => ack.user_id === person.id)).map((person) => ({ id: person.id, name: person.display_name })),
      })),
    });
  }

  // 신입 메뉴 체크리스트
  if (path === "/api/training" && method === "GET") {
    const people = load(recipes);
    const training = trainingOf(people, content, me);
    const locked = role === "staff" ? previewLockedSections() : [];
    return json({ ...training, manuals: training.manuals.filter((doc) => !locked.includes(doc.sectionId)), quiz: quizOf(people, me) });
  }

  if (path === "/api/training" && method === "POST") {
    const recipeId = String(body.recipeId ?? "");
    if (!recipeId) return json({ error: "어떤 메뉴인지 없습니다." }, 400);
    const people = load(recipes);
    const row = checkFor(people, me, recipeId);
    row.practiced_at = row.practiced_at ? null : new Date().toISOString();
    save(people);
    return json({ ...trainingOf(people, content, me), quiz: quizOf(people, me) });
  }

  if (path === "/api/admin/training" && method === "GET") {
    if (role !== "owner") return ownerOnly();
    const people = load(recipes);
    const userId = new URL(url, window.location.origin).searchParams.get("user");
    if (userId) return json(trainingOf(people, content, userId));
    const recipeIds = new Set(recipes.map((recipe) => recipe.id));
    return json({
      total: recipes.length,
      staff: people.staff.map((person) => {
        const mine = people.checks.filter((row) => row.user_id === person.id && recipeIds.has(row.recipe_id) && !row.recipe_id.startsWith(examCheckPrefix));
        const latest = quizOf(people, person.id)[0];
        return {
          id: person.id,
          name: person.display_name || person.login_id,
          role: person.role,
          active: person.active,
          practiced: mine.filter((row) => row.practiced_at).length,
          confirmed: mine.filter((row) => row.confirmed_at).length,
          docsRead: people.checks.filter((row) => row.user_id === person.id && row.recipe_id.startsWith(manualCheckPrefix) && row.practiced_at).length,
          docsConfirmed: people.checks.filter((row) => row.user_id === person.id && row.recipe_id.startsWith(manualCheckPrefix) && row.confirmed_at).length,
          quiz: latest ? { score: latest.score, total: latest.total, created_at: latest.created_at } : null,
        };
      }),
    });
  }

  if (path === "/api/admin/training" && method === "POST") {
    if (role !== "owner") return ownerOnly();
    const userId = String(body.userId ?? "");
    const recipeId = String(body.recipeId ?? "");
    if (!userId || !recipeId) return json({ error: "직원과 메뉴가 필요합니다." }, 400);
    const people = load(recipes);
    const row = checkFor(people, userId, recipeId);
    const confirm = !row.confirmed_at;
    row.confirmed_at = confirm ? new Date().toISOString() : null;
    row.confirmed_by = confirm ? ownerId : null;
    save(people);
    return json(trainingOf(people, content, userId));
  }

  if (path === "/api/quiz" && method === "POST") {
    if (!Number.isInteger(body.score) || !Number.isInteger(body.total) || Number(body.total) <= 0) return json({ error: "점수 정보가 없습니다." }, 400);
    const people = load(recipes);
    people.quiz.push({ id: Math.max(0, ...people.quiz.map((row) => row.id)) + 1, user_id: me, score: Number(body.score), total: Number(body.total), created_at: new Date().toISOString() });
    save(people);
    return json({ quiz: quizOf(people, me) });
  }

  // 시험 · 인증
  const examStatusOf = (people: PreviewPeople, userId: string) => ({
    exams: buildExamStatus(
      getExams(content),
      people.quiz.filter((row) => row.user_id === userId && row.examId).map((row) => ({ examId: row.examId!, score: row.score, total: row.total, created_at: row.created_at })),
      people.checks.filter((row) => row.user_id === userId && row.recipe_id.startsWith(examCheckPrefix)).map((row) => ({ recipe_id: row.recipe_id, practiced_at: row.practiced_at, confirmed_at: row.confirmed_at, confirmed_by_name: row.confirmed_by ? nameOf(people, row.confirmed_by) : null })),
    ),
  });

  if (path === "/api/exam" && method === "GET") {
    if (lockedForMe.includes("exam")) return json({ error: "이 메뉴는 지금 잠겨 있습니다.", locked: true }, 423);
    return json({ ...examStatusOf(load(recipes), me), manuals: readableManuals(content).filter((doc) => !lockedForMe.includes(doc.sectionId)) });
  }

  if (path === "/api/exam" && method === "POST") {
    const people = load(recipes);
    const exam = getExams(content).find((item) => item.id === body.examId);
    if (!exam) return json({ error: "어떤 시험인지 없습니다." }, 400);
    if (body.action === "written") {
      if (!Number.isInteger(body.score) || !Number.isInteger(body.total) || Number(body.total) <= 0) return json({ error: "점수 정보가 올바르지 않습니다." }, 400);
      people.quiz.push({ id: Math.max(0, ...people.quiz.map((row) => row.id)) + 1, user_id: me, score: Number(body.score), total: Number(body.total), created_at: new Date().toISOString(), examId: exam.id });
    } else if (body.action === "ready") {
      const row = checkFor(people, me, examCheckKey(exam.id, String(body.itemId)));
      row.practiced_at = row.practiced_at ? null : new Date().toISOString();
    } else return json({ error: "무엇을 할지 없습니다." }, 400);
    save(people);
    return json({ ...examStatusOf(people, me), manuals: readableManuals(content).filter((doc) => !lockedForMe.includes(doc.sectionId)) });
  }

  if (path === "/api/admin/exam" && method === "GET") {
    if (role !== "owner") return ownerOnly();
    const people = load(recipes);
    const userId = new URL(url, window.location.origin).searchParams.get("user");
    if (userId) return json(examStatusOf(people, userId));
    return json({
      exams: getExams(content).map((exam) => ({ id: exam.id, title: exam.title })),
      staff: people.staff.filter((person) => person.active).map((person) => ({
        id: person.id,
        name: person.display_name || person.login_id,
        role: person.role,
        exams: examStatusOf(people, person.id).exams.map((exam) => ({ id: exam.id, best: exam.best, writtenPassed: exam.writtenPassed, practicalPassed: exam.practical.filter((item) => item.passed_at).length, practicalTotal: exam.practical.length, waiting: exam.practical.filter((item) => item.ready_at && !item.passed_at).length, certified: exam.certified })),
      })),
    });
  }

  if (path === "/api/admin/exam" && method === "POST") {
    if (role !== "owner") return ownerOnly();
    const people = load(recipes);
    const row = checkFor(people, String(body.userId ?? ""), examCheckKey(String(body.examId ?? ""), String(body.itemId ?? "")));
    const passed = !row.confirmed_at;
    row.confirmed_at = passed ? new Date().toISOString() : null;
    row.confirmed_by = passed ? ownerId : null;
    save(people);
    return json(examStatusOf(people, String(body.userId ?? "")));
  }

  // 직원 계정 관리
  if (path === "/api/admin/staff" && method === "GET") {
    if (role !== "owner") return ownerOnly();
    return json({ staff: load(recipes).staff, me: ownerId });
  }

  if (path === "/api/admin/staff" && method === "PATCH") {
    if (role !== "owner") return ownerOnly();
    const id = String(body.id ?? "");
    if (id === ownerId && (body.active === false || (body.role && body.role !== "owner"))) return json({ error: "내 계정은 중지하거나 직원으로 바꿀 수 없습니다." }, 400);
    const people = load(recipes);
    const person = people.staff.find((row) => row.id === id);
    if (!person) return json({ error: "직원을 찾을 수 없습니다." }, 404);
    if (typeof body.active === "boolean") person.active = body.active;
    if (body.role === "owner" || body.role === "staff") person.role = body.role;
    if (typeof body.displayName === "string") person.display_name = body.displayName.trim().slice(0, 40);
    save(people);
    return json({ staff: person });
  }

  return null;
}
