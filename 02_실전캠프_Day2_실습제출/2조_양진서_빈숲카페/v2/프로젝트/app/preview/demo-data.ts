import type { Recipe, RecipeContent } from "../recipes/recipe-data";
import { manualNoticePrefix, readableManuals } from "../manual/manual-data";
import { manualCheckPrefix } from "../manual/training-path";
import { examCheckKey } from "../exam/exam-data";
import { checkItemKey, isScheduledOn, lastDates, parseCheckStep, signoffItemKey, todayInSeoul, type DailyRow } from "../checks/check-data";
import type { ViewRow } from "../manage/views/view-data";
import type { QuestProgressRow } from "../quest/quest-data";
import { buildWeeklyQuests, weekStartSeoul } from "../quest/quest-data";
import type { PraiseRow } from "../praise/praise-data";
import type { HandoverRow } from "../handover/handover-data";

// 시연용 가상 데이터 — 한 파일에 모아 둔다 (숫자·사람·사건을 바꾸려면 여기만).
// "오늘" 기준으로 지난 6주를 매번 새로 만들므로 언제 열어도 최근 기록처럼 보인다. 같은 날에는 같은 결과(씨앗 고정).
// 사람·이름·숫자는 전부 가상이다. 실제 직원·손님·매출을 베끼지 않는다.

export type StaffRow = { id: string; login_id: string; display_name: string; role: "owner" | "staff"; active: boolean; created_at: string };
export type CheckRow = { user_id: string; recipe_id: string; practiced_at: string | null; confirmed_at: string | null; confirmed_by: string | null };
// examId 가 있으면 시험 필기 결과, 없으면 연습 퀴즈
export type QuizRow = { id: number; user_id: string; score: number; total: number; created_at: string; examId?: string };
export type NoticeRow = { id: number; version: number; recipe_id: string; recipe_name: string; change_reason: string; published_by: string; created_at: string; acks: { user_id: string; acked_at: string }[] };
export type DailyCheckRow = DailyRow & { check_date: string };
export type QuestRow = QuestProgressRow & { user_id: string; week_start: string };
export type PreviewPeople = { staff: StaffRow[]; checks: CheckRow[]; quiz: QuizRow[]; notices: NoticeRow[]; daily: DailyCheckRow[]; views?: ViewRow[]; quests?: QuestRow[]; praises?: PraiseRow[]; handovers?: HandoverRow[] };

export const ownerId = "preview-owner";
export const staffId = "preview-staff-e"; // "직원 눈으로" 볼 때의 나 = 신입 최지우
export const ownerName = "미리보기 사장";
export const demoDays = 42;

// 가상 직원. 이름은 흔한 가상 이름이고 실제 직원과 무관하다.
export const demoStaff = {
  owner: { id: ownerId, login_id: "owner", display_name: ownerName, role: "owner" as const, active: true, days: 400 },
  hanul: { id: "preview-staff-a", login_id: "hanul", display_name: "김하늘", role: "staff" as const, active: true, days: 150, note: "오전조 · 월~금" },
  doyun: { id: "preview-staff-b", login_id: "doyun", display_name: "박도윤", role: "staff" as const, active: true, days: 95, note: "마감조 · 월~금" },
  seojun: { id: "preview-staff-d", login_id: "seojun", display_name: "이서준", role: "staff" as const, active: true, days: 60, note: "주말 알바" },
  jiwoo: { id: staffId, login_id: "jiwoo", display_name: "최지우", role: "staff" as const, active: true, days: 12, note: "신입 · 오전조 교육 중" },
  sua: { id: "preview-staff-c", login_id: "sua", display_name: "정수아", role: "staff" as const, active: false, days: 200, note: "퇴사 (중지)" },
};

// 시연 장면 3개 (발표·체험 안내에 쓴다)
export const demoScenes = [
  { title: "장면 1 · 바뀐 레시피, 누가 확인했나", path: "/recipes/changes", eye: "사장", story: "어제 「테스트 바닐라라떼」 정량을 고쳐 게시했더니 김하늘·박도윤은 확인했고 신입 최지우는 아직 안 봤다." },
  { title: "장면 2 · 오늘 체크에서 잡힌 일", path: "/checks", eye: "사장", story: "6일 전 마감 체크 2개가 빠졌고, 냉장고 온도 7.8℃가 기록된 날이 있다. 사장 확인함이 안 찍힌 날도 보인다." },
  { title: "장면 3 · 신입의 이번 주", path: "/quest", eye: "직원", story: "신입 최지우(직원 눈)의 이번 주 퀘스트 5개 중 2개 깸, 적용 미션은 사장 확인 대기. 오늘 받은 칭찬을 릴레이로 이어 보내기." },
];

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (date: string, time: string) => new Date(`${date}T${time}:00+09:00`).toISOString();
const clock = (hour: number, minute: number) => `${String(hour).padStart(2, "0")}:${String(Math.max(0, Math.min(59, Math.round(minute)))).padStart(2, "0")}`;
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=일

export function buildDemoPeople(content: RecipeContent): PreviewPeople {
  const today = todayInSeoul();
  const rng = seeded(Number(today.replace(/-/g, "")));
  const pick = <T,>(items: T[]) => items[Math.floor(rng() * items.length)];
  const chance = (p: number) => rng() < p;
  const dates = lastDates(today, demoDays); // dates[0] = 오늘
  const daysAgoIso = (days: number, time = "12:00") => at(dates[Math.min(dates.length - 1, Math.max(0, Math.round(days)))], time);
  const recipes: Recipe[] = content.recipes;
  const docs = readableManuals(content);
  const dailyDocs = docs.filter((doc) => doc.dailyCheck && doc.kind !== "response");
  const S = demoStaff;
  const nameOf = (id: string) => Object.values(S).find((person) => person.id === id)?.display_name ?? "";

  const staff: StaffRow[] = Object.values(S).map((person) => ({ id: person.id, login_id: person.login_id, display_name: person.display_name, role: person.role, active: person.active, created_at: daysAgoIso(person.days, "10:00") }));

  // ---------- 오늘 체크 (6주) ----------
  const daily: DailyCheckRow[] = [];
  const pushCheck = (date: string, docId: string, text: string, by: string, time: string, value = "") => {
    daily.push({ check_date: date, doc_id: docId, item_key: checkItemKey(text), item_text: text, checked_by: by, checked_by_name: nameOf(by), checked_at: at(date, time), value });
  };
  // 일부러 넣는 사건: 6일 전 마감 2개 빠짐, 13일 전 온도 7.8℃, 20일 전 폐기 12개, 3일 전 사장 확인 없음
  const incidents = { missedClose: dates[6], hotFridge: dates[13], bigWaste: dates[20], noSignoff: new Set([dates[3], dates[9], dates[17], dates[24]]) };
  dates.forEach((date, ago) => {
    const wd = weekday(date);
    const weekend = wd === 0 || wd === 6;
    const opener = weekend ? S.seojun.id : S.hanul.id;
    const closer = weekend ? S.seojun.id : S.doyun.id;
    const trainee = !weekend && ago < S.jiwoo.days;
    for (const doc of dailyDocs) {
      const isClose = doc.id.includes("close");
      const isHygiene = doc.id.includes("hygiene");
      const by = isClose ? closer : opener;
      const base = isClose ? 21 : isHygiene ? 9 : 8;
      const items = doc.steps.map((step) => step.trim()).filter(Boolean).filter((step) => isScheduledOn(parseCheckStep(step).schedule, date));
      // 오늘: 오픈은 절반, 마감은 아직
      const limit = ago === 0 ? (isClose ? 0 : Math.ceil(items.length / 2)) : items.length;
      items.slice(0, limit).forEach((text, index) => {
        if (date === incidents.missedClose && isClose && index >= items.length - 2) return; // 빠진 마감 체크
        if (ago > 0 && chance(0.04)) return; // 가끔 하나씩 빠짐
        const parsed = parseCheckStep(text);
        let value = "";
        if (parsed.unit === "℃") value = date === incidents.hotFridge ? "7.8" : (3.2 + rng() * 2.2).toFixed(1);
        else if (parsed.unit === "개") value = String(date === incidents.bigWaste ? 12 : Math.floor(rng() * 6));
        else if (parsed.unit !== null) value = String(Math.floor(rng() * 10));
        const who = trainee && !isClose && index % 2 === 1 ? S.jiwoo.id : by;
        pushCheck(date, doc.id, text, who, clock(base, 5 + index * 7 + rng() * 5), value);
      });
      if (ago > 0 && !incidents.noSignoff.has(date) && chance(0.9)) pushCheck(date, doc.id, "확인함", S.owner.id, isClose ? clock(22, 30 + rng() * 20) : clock(10, rng() * 40));
    }
  });
  // 사장 확인함 열쇠로 바꾼다
  for (const row of daily) if (row.item_text === "확인함") row.item_key = signoffItemKey;

  // ---------- 교육 기록 ----------
  const checks: CheckRow[] = [];
  const train = (user: string, recipeId: string, practicedDays: number, confirmedDays: number | null) => {
    checks.push({ user_id: user, recipe_id: recipeId, practiced_at: daysAgoIso(practicedDays, "15:00"), confirmed_at: confirmedDays === null ? null : daysAgoIso(confirmedDays, "18:00"), confirmed_by: confirmedDays === null ? null : S.owner.id });
  };
  recipes.forEach((recipe, index) => {
    train(S.hanul.id, recipe.id, 120 - index * 5, 118 - index * 5);
    if (index < 8) train(S.doyun.id, recipe.id, 80 - index * 6, index < 7 ? 78 - index * 6 : null);
    if (index < 5) train(S.seojun.id, recipe.id, 40 - index * 5, index < 3 ? 38 - index * 5 : null);
    if (index < 2) train(S.jiwoo.id, recipe.id, 8 - index * 3, index === 0 ? 6 : null);
  });
  docs.filter((doc) => doc.kind !== "response").forEach((doc, index) => {
    train(S.hanul.id, `${manualCheckPrefix}${doc.id}`, 110 - index * 4, 108 - index * 4);
    if (index < 6) train(S.doyun.id, `${manualCheckPrefix}${doc.id}`, 70 - index * 5, 68 - index * 5);
    if (index < 3) train(S.seojun.id, `${manualCheckPrefix}${doc.id}`, 30 - index * 4, index < 2 ? 28 - index * 4 : null);
  });
  // 신입: 1일차 문서 읽음 (안 읽은 매뉴얼이 남아 있는 상태)
  train(S.jiwoo.id, `${manualCheckPrefix}demo-standard-motto`, 10, 9);
  train(S.jiwoo.id, `${manualCheckPrefix}demo-hygiene-daily`, 9, null);
  // 실기: 김하늘 전부 합격, 박도윤 2개 합격 + 1개 준비됨
  ["p1", "p2", "p3"].forEach((item, index) => {
    train(S.hanul.id, examCheckKey("demo-exam-1", item), 60 - index, 58 - index);
    train(S.doyun.id, examCheckKey("demo-exam-1", item), 20 - index * 3, index < 2 ? 18 - index * 3 : null);
  });

  // ---------- 퀴즈·필기 ----------
  const quiz: QuizRow[] = [];
  let quizId = 1;
  const practice = (user: string, days: number, score: number) => quiz.push({ id: quizId++, user_id: user, score, total: 10, created_at: daysAgoIso(days, "16:30") });
  [38, 31, 24, 17, 10, 3].forEach((days, index) => practice(S.hanul.id, days, 8 + (index % 3)));
  [35, 28, 21, 14, 7, 2].forEach((days, index) => practice(S.doyun.id, days, 6 + (index % 4)));
  [27, 13, 6].forEach((days, index) => practice(S.seojun.id, days, 7 + index));
  [8, 5, 1].forEach((days, index) => practice(S.jiwoo.id, days, 5 + index * 2));
  // 필기: 김하늘 9/10 합격, 박도윤 6 → 8 두 번 만에 합격, 이서준 7 (불합격)
  quiz.push({ id: quizId++, user_id: S.hanul.id, score: 9, total: 10, created_at: daysAgoIso(62, "17:00"), examId: "demo-exam-1" });
  quiz.push({ id: quizId++, user_id: S.doyun.id, score: 6, total: 10, created_at: daysAgoIso(26, "17:00"), examId: "demo-exam-1" });
  quiz.push({ id: quizId++, user_id: S.doyun.id, score: 8, total: 10, created_at: daysAgoIso(22, "17:00"), examId: "demo-exam-1" });
  quiz.push({ id: quizId++, user_id: S.seojun.id, score: 7, total: 10, created_at: daysAgoIso(11, "17:00"), examId: "demo-exam-1" });

  // ---------- 바뀐 것 알림 ----------
  const changedRecipe = recipes[2] ?? recipes[0];
  const notices: NoticeRow[] = [
    { id: 1, version: 4, recipe_id: `${manualNoticePrefix}demo-close-closing`, recipe_name: "예시 · 마감 순서", change_reason: "마감 때 폐기 수량 기록 추가", published_by: ownerName, created_at: daysAgoIso(8, "21:00"), acks: [S.hanul.id, S.doyun.id, S.seojun.id].map((id, index) => ({ user_id: id, acked_at: daysAgoIso(7 - index, "09:30") })) },
    ...(changedRecipe ? [{ id: 2, version: 5, recipe_id: changedRecipe.id, recipe_name: changedRecipe.name, change_reason: "시럽 정량 15 → 20ml (단맛 보강)", published_by: ownerName, created_at: daysAgoIso(1, "20:40"), acks: [{ user_id: S.hanul.id, acked_at: daysAgoIso(0.5, "08:20") }, { user_id: S.doyun.id, acked_at: daysAgoIso(0.3, "13:10") }] }] : []),
  ];

  // ---------- 열람 기록 (6주) ----------
  const views: ViewRow[] = [];
  let viewId = 1;
  const devices: Record<string, string> = { [S.hanul.id]: "아이폰 · Safari", [S.doyun.id]: "안드로이드 · Chrome", [S.seojun.id]: "안드로이드 · 삼성 브라우저", [S.jiwoo.id]: "아이폰 · Safari", [S.owner.id]: "윈도우 PC · Chrome" };
  const view = (user: string, kind: ViewRow["kind"], targetId: string, targetName: string, date: string, time: string, outside = false) => {
    views.push({ id: viewId++, user_id: user, user_name: nameOf(user), kind, target_id: targetId, target_name: targetName, ip: outside ? "198.51.100.23" : "203.0.113.5", outside, device: devices[user] ?? "아이폰 · Safari", viewed_at: at(date, time) });
  };
  const questions = ["카페라떼 핫 액체 얼마야?", "마감 순서 알려줘", "환불해 달라고 하면 뭐라고 해?", "스무디 만드는 순서", "기기 고장 나면 누구한테 보고해?"];
  dates.forEach((date, ago) => {
    const wd = weekday(date);
    const weekend = wd === 0 || wd === 6;
    const people = weekend ? [S.seojun.id] : [S.hanul.id, S.doyun.id, ...(ago < S.jiwoo.days ? [S.jiwoo.id] : [])];
    for (const user of people) {
      const start = user === S.doyun.id ? 14 : 8;
      view(user, "login", "", "", date, clock(start, rng() * 30));
      const count = user === S.jiwoo.id ? 3 + Math.floor(rng() * 3) : 1 + Math.floor(rng() * 2);
      for (let i = 0; i < count; i += 1) {
        if (chance(0.6)) { const recipe = pick(recipes); view(user, "recipe", recipe.id, recipe.name, date, clock(start + 1 + i, rng() * 59)); }
        else { const doc = pick(docs); view(user, "manual", doc.id, doc.title, date, clock(start + 1 + i, rng() * 59)); }
      }
      if (chance(0.3)) view(user, "chat", "", pick(questions), date, clock(start + 3, rng() * 59));
      if (ago > 0) view(user, "logout", "", chance(0.5) ? "한동안 쓰지 않아 자동" : "", date, clock(start + 6, rng() * 59));
    }
  });
  // 사건: 이서준이 집에서(매장 밖) 레시피를 열어 봄 — 4일 전 밤
  if (recipes[1]) { view(S.seojun.id, "login", "", "", dates[4], "23:12", true); view(S.seojun.id, "recipe", recipes[1].id, recipes[1].name, dates[4], "23:13", true); view(S.seojun.id, "recipe", recipes[3]?.id ?? recipes[1].id, recipes[3]?.name ?? recipes[1].name, dates[4], "23:15", true); }

  // ---------- 퀘스트 진행 (지난 5주 + 이번 주) ----------
  const quests: QuestRow[] = [];
  const thisWeek = weekStartSeoul();
  const weeks: string[] = [];
  for (let i = 0; i < 6; i += 1) { const d = new Date(`${thisWeek}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 7 * i); weeks.push(d.toISOString().slice(0, 10)); }
  const activeStaff = [S.hanul, S.doyun, S.seojun, S.jiwoo];
  weeks.forEach((week, back) => {
    for (const person of activeStaff) {
      if (back >= Math.ceil(person.days / 7) + 1) continue;
      const list = buildWeeklyQuests({ userId: person.id, weekStart: week, content, docs, practicedRecipeIds: new Set(), readDocIds: new Set() });
      const target = back === 0 ? (person.id === S.jiwoo.id ? 2 : person.id === S.hanul.id ? 4 : 1 + Math.floor(rng() * 3)) : person.id === S.hanul.id ? 5 : 2 + Math.floor(rng() * 4);
      let cleared = 0;
      for (const quest of list) {
        if (quest.kind === "mission") {
          if (back === 0) {
            if (person.id === S.jiwoo.id || person.id === S.doyun.id) quests.push({ user_id: person.id, week_start: week, quest_id: "mission", status: "pending", attempts: 0, note: person.id === S.jiwoo.id ? "스팀 피처에 온도계 꼭 꽂기" : "마감 때 폐기 수량 바로 적기", done_at: daysAgoIso(1, "19:00"), confirmed_at: null });
          } else if (cleared < target) {
            quests.push({ user_id: person.id, week_start: week, quest_id: "mission", status: "confirmed", attempts: 0, note: pick(["손님 나갈 때 꼭 인사하기", "에스프레소 추출 시간 재기", "우유 스팀 온도 60℃ 지키기", "주문 복창하기"]), done_at: at(week, "18:00"), confirmed_at: at(week, "20:00"), confirmed_by_name: ownerName });
            cleared += 1;
          }
          continue;
        }
        if (cleared >= target) continue;
        // 이번 주 신입은 문제를 남겨 둔다 (시연 때 직접 풀어 보게)
        if (back === 0 && person.id === S.jiwoo.id && quest.kind === "quiz") continue;
        const attempts = quest.kind === "quiz" ? 1 + (chance(0.3) ? 1 : 0) + (chance(0.1) ? 1 : 0) : 0;
        const doneDay = new Date(`${week}T00:00:00Z`); doneDay.setUTCDate(doneDay.getUTCDate() + Math.floor(rng() * (back === 0 ? 1 : 6)));
        quests.push({ user_id: person.id, week_start: week, quest_id: quest.id, status: "done", attempts, note: "", done_at: at(doneDay.toISOString().slice(0, 10), clock(10 + Math.floor(rng() * 9), rng() * 59)), confirmed_at: null });
        cleared += 1;
      }
    }
  });

  // ---------- 칭찬 (6주) ----------
  const praises: PraiseRow[] = [];
  const praiseTexts = ["피크 때 먼저 설거지 맡아 줘서 고마워요", "손님께 설명하는 말투가 정말 친절했어요", "마감 정리가 깔끔해서 오픈이 편했어요", "스팀 밀크 거품이 요즘 제일 좋아요", "단체 주문 때 침착하게 역할 나눠 줘서 좋았어요", "신입 교육 도와줘서 고마워요", "환불 손님 응대 보고 배웠어요"];
  const pairs: [string, string][] = [[S.doyun.id, S.hanul.id], [S.hanul.id, S.doyun.id], [S.owner.id, S.seojun.id], [S.hanul.id, S.jiwoo.id], [S.seojun.id, S.hanul.id], [S.owner.id, S.hanul.id], [S.jiwoo.id, S.hanul.id], [S.doyun.id, S.seojun.id]];
  let praiseId = 1;
  for (let ago = demoDays - 1; ago >= 1; ago -= 1) {
    if (!chance(0.45)) continue;
    const [from, to] = pick(pairs);
    if (ago < S.jiwoo.days || (from !== S.jiwoo.id && to !== S.jiwoo.id)) praises.push({ id: praiseId++, from_user: from, from_name: nameOf(from), to_user: to, to_name: nameOf(to), text: pick(praiseTexts), created_at: daysAgoIso(ago, clock(13 + Math.floor(rng() * 8), rng() * 59)) });
  }
  // 오늘: 김하늘 → 최지우 (직원 눈으로 보면 "릴레이를 이어가요")
  praises.push({ id: praiseId++, from_user: S.hanul.id, from_name: S.hanul.display_name, to_user: S.jiwoo.id, to_name: S.jiwoo.display_name, text: "오늘 아침 단체 주문 때 컵 세팅 먼저 해 줘서 고마워요", created_at: daysAgoIso(0, "09:40") });

  // ---------- 인수인계 (지난 7일) ----------
  const handovers: HandoverRow[] = [];
  const notes: [number, string, "open" | "middle" | "close", string, string[]][] = [
    [0, S.hanul.id, "open", "15시 단체 예약 6명 (아이스 위주) · 디카페인 원두 1봉 남음, 오늘 발주 넣어 주세요", []],
    [1, S.doyun.id, "close", "우유 2팩 남음 — 내일 아침 발주 필요\n2번 그라인더 분쇄도 한 칸 굵게 조정함 (추출 32초 → 28초)", [S.hanul.id, S.owner.id]],
    [2, S.hanul.id, "open", "제빙기 소리 평소보다 큼, 오후에 한 번 봐 주세요 · 시럽 재고 바닐라 1통", [S.doyun.id, S.owner.id]],
    [3, S.doyun.id, "close", "손님 분실물(검정 우산) 카운터 아래 보관 · 폐기 6개(딸기라떼 베이스 유통기한)", [S.hanul.id]],
    [5, S.seojun.id, "close", "주말 매출 높아 컵 재고 적음, 월요일 오픈 때 확인 · 테라스 의자 하나 흔들림", [S.hanul.id, S.doyun.id, S.owner.id]],
  ];
  notes.forEach(([ago, author, shift, text, readers], index) => {
    handovers.push({ id: index + 1, author_id: author, author_name: nameOf(author), shift, text, created_at: daysAgoIso(ago, shift === "close" ? "22:10" : "11:30"), reads: readers.map((reader, order) => ({ user_id: reader, user_name: nameOf(reader), read_at: daysAgoIso(Math.max(0, ago - 0.3 - order * 0.1), "12:00") })) });
  });

  // 오래된 것이 앞에 오게 (저장 공간 보호로 뒤쪽만 남길 때 최근 것이 남도록)
  const byTime = <T,>(items: T[], key: (item: T) => string) => [...items].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return { staff, checks, quiz, notices, daily: byTime(daily, (row) => row.checked_at), views: byTime(views, (row) => row.viewed_at), quests, praises: byTime(praises, (row) => row.created_at), handovers };
}
