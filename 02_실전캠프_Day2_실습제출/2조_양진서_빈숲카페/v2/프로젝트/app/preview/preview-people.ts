"use client";

import type { Recipe, RecipeContent } from "../recipes/recipe-data";
import { manualNoticePrefix, readableManuals } from "../manual/manual-data";
import { getTrainingPath, manualCheckPrefix } from "../manual/training-path";
import { buildExamStatus, examCheckKey, examCheckPrefix, getExams } from "../exam/exam-data";
import { buildCheckDocs, buildDaySummaries, checkItemKey, isCheckDate, lastDates, signoffItemKey, todayInSeoul, type DailyRow } from "../checks/check-data";
import type { ViewRow } from "../manage/views/view-data";
import { breakdown, buildBoard, defaultLevels, emptyCounts, highlights, levelFor, periodStart, totalPoints, type ActivityCounts, type Period } from "../score/score-data";
import { buildWeeklyQuests, countCleared, isCorrect, mergeProgress, previousWeekStart, weekStartSeoul, type QuestProgressRow } from "../quest/quest-data";

// 미리보기용 "사람" 데이터: 가짜 직원, 메뉴 체크리스트, 퀴즈 점수, 바뀐 레시피 알림과 확인 기록.
// 전부 이 브라우저(localStorage)에만 있고 서버·데이터 창고로 가는 길은 없다. 실제 직원 이름은 쓰지 않는다.

// 예시 기록의 모양이 바뀌면 숫자를 올린다 — 예전 버전을 눌러 본 브라우저에 남은 옛 예시가 새 화면을 가리지 않게
const storageKey = "beansoop-preview-people-v4";
const oldStorageKeys = ["beansoop-preview-people-v1", "beansoop-preview-people-v2", "beansoop-preview-people-v3"];
const roleCookie = "bs_preview_role";

const ownerId = "preview-owner";
const staffId = "preview-staff-a";

type StaffRow = { id: string; login_id: string; display_name: string; role: "owner" | "staff"; active: boolean; created_at: string };
type CheckRow = { user_id: string; recipe_id: string; practiced_at: string | null; confirmed_at: string | null; confirmed_by: string | null };
// examId 가 있으면 시험 필기 결과, 없으면 연습 퀴즈
type QuizRow = { id: number; user_id: string; score: number; total: number; created_at: string; examId?: string };
type NoticeRow = { id: number; version: number; recipe_id: string; recipe_name: string; change_reason: string; published_by: string; created_at: string; acks: { user_id: string; acked_at: string }[] };
type DailyCheckRow = DailyRow & { check_date: string };
type QuestRow = QuestProgressRow & { user_id: string; week_start: string };
type PreviewPeople = { staff: StaffRow[]; checks: CheckRow[]; quiz: QuizRow[]; notices: NoticeRow[]; daily: DailyCheckRow[]; views?: ViewRow[]; quests?: QuestRow[] };

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

const openSteps = ["(예시) 출근 기록을 남긴다", "(예시) 전원·조명·기기 예열: ○○ 순서로", "(예시) 재료 상태 확인: ○○", "(예시) 진열·청결 확인", "(예시) 영업 시작 전 책임자에게 확인받는다"];

function seedDaily(): DailyCheckRow[] {
  const today = todayInSeoul();
  const yesterday = lastDates(today, 2)[1];
  const at = (date: string, time: string) => new Date(`${date}T${time}:00+09:00`).toISOString();
  const row = (date: string, text: string, by: string, name: string, time: string, key = checkItemKey(text)): DailyCheckRow => ({ check_date: date, doc_id: "demo-open-prep", item_key: key, item_text: text, checked_by: by, checked_by_name: name, checked_at: at(date, time) });
  return [
    ...openSteps.map((text, index) => row(yesterday, text, staffId, "직원 A", `08:${String(10 + index * 7).padStart(2, "0")}`)),
    row(yesterday, "확인함", ownerId, "미리보기 사장", "09:05", signoffItemKey),
    row(today, openSteps[0], "preview-staff-b", "직원 B", "08:12"),
    row(today, openSteps[1], "preview-staff-b", "직원 B", "08:20"),
  ];
}

// 미리보기 열람 기록 예시: 직원 A는 매장에서, 직원 B는 한 번 매장 밖에서 연 것으로
function seedViews(recipes: Recipe[]): ViewRow[] {
  const [first, second] = recipes;
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
  const row = (id: number, user_id: string, user_name: string, kind: ViewRow["kind"], target_id: string, target_name: string, hours: number, outside = false, device = "아이폰 · Safari"): ViewRow =>
    ({ id, user_id, user_name, kind, target_id, target_name, ip: outside ? "198.51.100.23" : "203.0.113.5", outside, device, viewed_at: hoursAgo(hours) });
  return [
    row(1, staffId, "직원 A", "login", "", "", 30),
    ...(first ? [row(2, staffId, "직원 A", "recipe", first.id, first.name, 29.8)] : []),
    row(3, staffId, "직원 A", "manual", "demo-open-prep", "예시 · 오픈 준비", 29.5),
    row(4, staffId, "직원 A", "logout", "", "한동안 쓰지 않아 자동", 28.9),
    row(5, "preview-staff-b", "직원 B", "login", "", "", 6, true, "안드로이드 · Chrome"),
    ...(second ? [row(6, "preview-staff-b", "직원 B", "recipe", second.id, second.name, 5.9, true, "안드로이드 · Chrome")] : []),
    row(7, "preview-staff-b", "직원 B", "chat", second?.id ?? "", "마감 순서 알려줘", 5.8, true, "안드로이드 · Chrome"),
    row(8, "preview-staff-b", "직원 B", "login", "", "", 1.5, false, "윈도우 PC · Chrome"),
    row(9, "preview-staff-b", "직원 B", "manual", "demo-close-closing", "예시 · 마감 순서", 1.4, false, "윈도우 PC · Chrome"),
  ];
}

// 처음 열었을 때 화면이 비어 보이지 않게 넣어 두는 가짜 기록
function freshPeople(recipes: Recipe[]): PreviewPeople {
  const [first, second, third] = recipes;
  return {
    views: seedViews(recipes),
    quests: [{ user_id: "preview-staff-b", week_start: weekStartSeoul(), quest_id: "mission", status: "pending", attempts: 0, note: "(예시) 라떼 스팀 때 피처 온도계 꼭 꽂기", done_at: daysAgo(0.3), confirmed_at: null }],
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
    // 오늘 체크 예시: 어제 오픈은 다 하고 사장 확인까지, 오늘 오픈은 직원 B가 두 개 해 둔 상태
    daily: seedDaily(),
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
    people.daily = (people.daily ?? []).slice(-400);
    people.views = (people.views ?? []).slice(-300);
    people.quests = (people.quests ?? []).slice(-200);
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

  // 오늘 체크 (서버의 app/api/checks 와 같은 규칙)
  if (path === "/api/checks") {
    if (lockedForMe.includes("checks")) return json({ error: "이 메뉴는 지금 잠겨 있습니다.", locked: true }, 423);
    const people = load(recipes);
    people.daily ??= [];
    const today = todayInSeoul();
    const docs = readableManuals(content).filter((doc) => !lockedForMe.includes(doc.sectionId));
    const meName = nameOf(people, me) ?? "";
    const viewOf = (requested: string | null) => {
      const date = role === "owner" && isCheckDate(requested) ? requested : today;
      const dates = lastDates(today, 14);
      return { date, today, docs: buildCheckDocs(docs, people.daily.filter((row) => row.check_date === date), me), history: role === "owner" ? buildDaySummaries(docs, people.daily, dates) : [] };
    };
    if (method === "GET") return json(viewOf(new URL(url, window.location.origin).searchParams.get("date")));
    if (method === "POST") {
      const doc = docs.find((item) => item.id === body.docId && item.dailyCheck);
      if (!doc) return json({ error: "어떤 문서인지 없습니다." }, 400);
      const drop = (date: string, key: string, onlyMine: boolean) => { people.daily = people.daily.filter((row) => !(row.check_date === date && row.doc_id === doc.id && row.item_key === key && (!onlyMine || row.checked_by === me))); };
      const add = (date: string, key: string, text: string) => { if (!people.daily.some((row) => row.check_date === date && row.doc_id === doc.id && row.item_key === key)) people.daily.push({ check_date: date, doc_id: doc.id, item_key: key, item_text: text, checked_by: me, checked_by_name: meName, checked_at: new Date().toISOString() }); };
      if (typeof body.signoff === "boolean") {
        if (role !== "owner") return json({ error: "확인함은 사장님만 누를 수 있습니다." }, 403);
        const date = isCheckDate(String(body.date ?? "")) ? String(body.date) : today;
        if (body.signoff) add(date, signoffItemKey, "확인함"); else drop(date, signoffItemKey, false);
        save(people);
        return json(viewOf(date));
      }
      const text = doc.steps.find((step) => checkItemKey(step) === body.itemKey);
      if (!text) return json({ error: "어떤 항목인지 없습니다." }, 400);
      if (body.checked === false) drop(today, String(body.itemKey), role !== "owner"); else add(today, String(body.itemKey), text);
      save(people);
      return json(viewOf(null));
    }
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

  // 레벨 · 점수판: 이 브라우저의 가짜 기록을 서버와 같은 규칙으로 센다
  if (path === "/api/score" && method === "GET") {
    const raw = new URL(url, window.location.origin).searchParams.get("period");
    const period: Period = raw === "week" || raw === "all" ? raw : "month";
    const people = load(recipes);
    const count = (since: string | null): ActivityCounts[] => people.staff.map((person) => {
      const after = (at: string | null | undefined) => Boolean(at) && (!since || (at as string) >= since);
      const mine = people.checks.filter((row) => row.user_id === person.id);
      const plain = mine.filter((row) => !row.recipe_id.startsWith(manualCheckPrefix) && !row.recipe_id.startsWith(examCheckPrefix));
      const docs = mine.filter((row) => row.recipe_id.startsWith(manualCheckPrefix));
      const quiz = people.quiz.filter((row) => row.user_id === person.id && after(row.created_at));
      return {
        ...emptyCounts(person),
        checks: (people.daily ?? []).filter((row) => row.checked_by === person.id && row.item_key !== signoffItemKey && after(row.checked_at)).length,
        signoffs: (people.daily ?? []).filter((row) => row.checked_by === person.id && row.item_key === signoffItemKey && after(row.checked_at)).length,
        practiced_recipes: plain.filter((row) => after(row.practiced_at)).length,
        confirmed_recipes: plain.filter((row) => after(row.confirmed_at)).length,
        docs_read: docs.filter((row) => after(row.practiced_at)).length,
        docs_confirmed: docs.filter((row) => after(row.confirmed_at)).length,
        exam_items: mine.filter((row) => row.recipe_id.startsWith(examCheckPrefix) && after(row.confirmed_at)).length,
        quiz_passed: quiz.filter((row) => !row.examId && row.score * 10 >= row.total * 7).length,
        exam_written: quiz.filter((row) => row.examId && row.score * 10 >= row.total * 8).length,
        acks: people.notices.reduce((sum, notice) => sum + notice.acks.filter((ack) => ack.user_id === person.id && after(ack.acked_at)).length, 0),
        reads: (people.views ?? seedViews(recipes)).filter((row) => row.user_id === person.id && (row.kind === "recipe" || row.kind === "manual") && after(row.viewed_at)).length,
        quests_done: (people.quests ?? []).filter((row) => row.user_id === person.id && row.status === "done" && row.quest_id !== "mission" && after(row.done_at)).length,
        missions_done: (people.quests ?? []).filter((row) => row.user_id === person.id && row.status === "confirmed" && after(row.confirmed_at)).length,
      };
    });
    const allTime = count(null);
    const since = periodStart(period);
    const periodRows = since ? count(since) : allTime;
    const meAll = allTime.find((row) => row.user_id === me)!;
    const mePeriod = periodRows.find((row) => row.user_id === me)!;
    const total = totalPoints(meAll);
    const payload: Record<string, unknown> = {
      period,
      levels: defaultLevels,
      me: { id: me, name: meAll.display_name, role, allTime: total, period: totalPoints(mePeriod), level: levelFor(total), breakdown: breakdown(mePeriod), breakdownAll: breakdown(meAll) },
      board: buildBoard(allTime, periodRows),
    };
    if (role === "owner") payload.stats = { rows: periodRows.filter((row) => row.active), highlights: highlights(periodRows) };
    return json(payload);
  }

  // 이번 주 퀘스트: 서버와 같은 규칙(직원 ID + 주 시작일 씨앗)으로 만들고, 진행만 이 브라우저에 남긴다
  if (path === "/api/quest") {
    const people = load(recipes);
    people.quests ??= [];
    const weekStart = weekStartSeoul();
    const lastWeek = previousWeekStart(weekStart);
    const docs = readableManuals(content).filter((doc) => !lockedForMe.includes(doc.sectionId));
    const mine = people.checks.filter((row) => row.user_id === me && row.practiced_at);
    const done = {
      practicedRecipeIds: new Set(mine.filter((row) => !row.recipe_id.startsWith(manualCheckPrefix) && !row.recipe_id.startsWith(examCheckPrefix)).map((row) => row.recipe_id)),
      readDocIds: new Set(mine.filter((row) => row.recipe_id.startsWith(manualCheckPrefix)).map((row) => row.recipe_id.slice(manualCheckPrefix.length))),
    };
    const quests = buildWeeklyQuests({ userId: me, weekStart, content, docs, practicedRecipeIds: done.practicedRecipeIds, readDocIds: done.readDocIds });
    const rowsOf = (week: string, user = me) => people.quests!.filter((row) => row.user_id === user && row.week_start === week);
    if (method === "GET") {
      const views = mergeProgress(quests, rowsOf(weekStart), done);
      const lastQuests = buildWeeklyQuests({ userId: me, weekStart: lastWeek, content, docs, practicedRecipeIds: done.practicedRecipeIds, readDocIds: done.readDocIds });
      const payload: Record<string, unknown> = { weekStart, quests: views, cleared: countCleared(views), lastWeek: { weekStart: lastWeek, cleared: countCleared(mergeProgress(lastQuests, rowsOf(lastWeek), done)), total: lastQuests.length } };
      if (role === "owner") {
        payload.missions = people.quests
          .filter((row) => row.quest_id === "mission" && (row.status === "pending" || row.status === "confirmed") && [weekStart, lastWeek].includes(row.week_start))
          .map((row) => ({ user_id: row.user_id, user_name: people.staff.find((person) => person.id === row.user_id)?.display_name ?? "", week_start: row.week_start, note: row.note, done_at: row.done_at, status: row.status }));
      }
      return json(payload);
    }
    const upsert = (user: string, week: string, questId: string, patch: Partial<QuestRow>) => {
      let row = people.quests!.find((item) => item.user_id === user && item.week_start === week && item.quest_id === questId);
      if (!row) {
        row = { user_id: user, week_start: week, quest_id: questId, status: "open", attempts: 0, note: "", done_at: null, confirmed_at: null };
        people.quests!.push(row);
      }
      Object.assign(row, patch);
      save(people);
      return row;
    };
    const now = () => new Date().toISOString();
    if (body.action === "answer") {
      const quest = quests.find((item) => item.id === body.questId && item.kind === "quiz");
      if (!quest) return json({ error: "이번 주 퀘스트에 없는 문제예요." }, 404);
      const choice = String(body.choice ?? "");
      if (!quest.choices?.includes(choice)) return json({ error: "보기 중에서 골라 주세요." }, 400);
      const existing = rowsOf(weekStart).find((row) => row.quest_id === quest.id);
      if (existing?.status === "done") return json({ correct: true });
      const correct = isCorrect(quest, choice);
      upsert(me, weekStart, quest.id, { status: correct ? "done" : "open", attempts: (existing?.attempts ?? 0) + 1, note: choice, done_at: correct ? now() : null });
      return json({ correct });
    }
    if (body.action === "mission" || body.action === "claim") {
      const text = String(body.note ?? "").trim().slice(0, 200);
      if (!text) return json({ error: "적용할 것을 한 줄 적어 주세요." }, 400);
      upsert(me, weekStart, "mission", { status: body.action === "claim" ? "pending" : "open", note: text, done_at: body.action === "claim" ? now() : null });
      return json({ ok: true });
    }
    if (body.action === "confirm") {
      if (role !== "owner") return ownerOnly();
      const row = people.quests.find((item) => item.user_id === String(body.userId ?? "") && item.week_start === String(body.weekStart ?? weekStart) && item.quest_id === "mission" && item.status === "pending");
      if (row) upsert(row.user_id, row.week_start, "mission", { status: "confirmed", confirmed_at: now(), confirmed_by_name: "미리보기 사장" });
      return json({ ok: true });
    }
    return json({ error: "알 수 없는 요청이에요." }, 400);
  }

  // 열람 기록: 이 브라우저에서 연 것만 더해진다 (가짜 사람 이름으로)
  if (path === "/api/view" && method === "POST") {
    const kind = body.kind === "recipe" || body.kind === "manual" || body.kind === "login" ? body.kind : null;
    if (!kind) return json({ error: "기록할 내용이 없습니다." }, 400);
    const people = load(recipes);
    people.views ??= seedViews(recipes);
    const id = String(body.id ?? "");
    const name = kind === "recipe" ? recipes.find((recipe) => recipe.id === id)?.name ?? "" : kind === "manual" ? readableManuals(content).find((doc) => doc.id === id)?.title ?? "" : "";
    const person = people.staff.find((row) => row.id === me);
    const last = people.views[people.views.length - 1];
    if (!(last && last.user_id === me && last.kind === kind && last.target_id === id && Date.now() - new Date(last.viewed_at).getTime() < 60_000)) {
      people.views.push({ id: Math.max(0, ...people.views.map((row) => row.id)) + 1, user_id: me, user_name: person?.display_name ?? "", kind, target_id: id, target_name: name, ip: "203.0.113.5", outside: false, device: "미리보기 브라우저", viewed_at: new Date().toISOString() });
      save(people);
    }
    return json({ ok: true });
  }

  if (path === "/api/admin/views" && method === "GET") {
    if (role !== "owner") return ownerOnly();
    const params = new URL(url, window.location.origin).searchParams;
    const days = Math.max(1, Math.min(90, Number(params.get("days") ?? 14) || 14));
    const userId = params.get("user") ?? "";
    const people = load(recipes);
    const since = Date.now() - days * 86_400_000;
    const rows = (people.views ?? seedViews(recipes)).filter((row) => new Date(row.viewed_at).getTime() >= since && (!userId || row.user_id === userId)).sort((a, b) => (a.viewed_at < b.viewed_at ? 1 : -1));
    return json({ rows, staff: people.staff, days, settings: { shopIps: ["203.0.113.5"], blockOutsideStaff: false, idleMinutes: 30, myIp: "203.0.113.5", myDevice: "미리보기 브라우저", myOutside: false } });
  }

  // 직원 계정 관리
  if (path === "/api/admin/staff" && method === "GET") {
    if (role !== "owner") return ownerOnly();
    return json({ staff: load(recipes).staff, me: ownerId });
  }

  if (path === "/api/admin/staff" && method === "POST") {
    if (role !== "owner") return ownerOnly();
    const loginId = String(body.loginId ?? "").trim().toLowerCase();
    const displayName = String(body.displayName ?? "").trim().slice(0, 40);
    if (!/^[a-z0-9][a-z0-9._-]{1,29}$/.test(loginId)) return json({ error: "아이디는 영문 소문자·숫자·점·밑줄·하이픈으로 2~30자 (예: alba-a)" }, 400);
    if (String(body.password ?? "").length < 8) return json({ error: "임시 비밀번호는 8자 이상이어야 해요." }, 400);
    if (!displayName) return json({ error: "화면에 보일 이름을 적어 주세요." }, 400);
    const people = load(recipes);
    if (people.staff.some((row) => row.login_id === loginId)) return json({ error: "이미 있는 아이디예요." }, 409);
    const person: StaffRow = { id: `preview-${loginId}`, login_id: loginId, display_name: displayName, role: "staff", active: true, created_at: new Date().toISOString() };
    people.staff.push(person);
    save(people);
    return json({ staff: person, warning: "" }, 201);
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
