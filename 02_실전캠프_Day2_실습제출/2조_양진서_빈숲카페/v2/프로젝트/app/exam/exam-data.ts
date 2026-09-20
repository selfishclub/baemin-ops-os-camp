// 시험 · 인증. 한 단계의 인증 = 필기(자동 채점) + 실기(사장이 직접 보고 합격 처리).
// 도구는 점수와 체크만 기록한다. 인증을 승급·시급과 어떻게 잇는지는 여기서 정하지 않는다 (노무 기준 — 확인 필요).
// 공개용 버전이라 아래 단계·기준 점수·실기 항목은 전부 가짜 예시다.

export type PracticalItem = { id: string; text: string };

export type ExamDef = {
  id: string;
  title: string;
  description: string;
  // 필기 문제 수와 합격 기준(맞은 개수). 문제는 레시피·매뉴얼에서 자동으로 만든다
  writtenCount: number;
  passScore: number;
  // 실기: 사장이 직접 보고 하나씩 합격 처리한다 (자동 합격 없음)
  practicalItems: PracticalItem[];
  // 직원에게 보이는 안내 (준비물, 언제 보는지 등)
  note: string;
};

// 기록 표에 적을 때 쓰는 열쇠: 실기 항목은 training_checks.recipe_id 에 "exam:<시험 id>:<항목 id>"
export const examCheckPrefix = "exam:";
export const examCheckKey = (examId: string, itemId: string) => `${examCheckPrefix}${examId}:${itemId}`;

export const defaultExams: ExamDef[] = [
  {
    id: "demo-exam-1",
    title: "예시 · 1단계 인증 (기본 메뉴 · 기본 응대)",
    description: "(예시) 기본 메뉴를 기준대로 만들고 손님을 맞이할 수 있는지 확인합니다.",
    writtenCount: 10,
    passScore: 8,
    practicalItems: [
      { id: "p1", text: "(예시) 기본 메뉴 ○○를 레시피를 보지 않고 기준대로 만든다" },
      { id: "p2", text: "(예시) 입점 인사부터 음료 전달까지 응대한다" },
      { id: "p3", text: "(예시) 작업 전 위생 점검을 순서대로 한다" },
    ],
    note: "(예시) 교육 경로 1주차를 마친 뒤에 봅니다. 실기는 책임자가 옆에서 직접 봅니다.",
  },
  {
    id: "demo-exam-2",
    title: "예시 · 2단계 인증 (오픈 · 마감 단독)",
    description: "(예시) 혼자 오픈과 마감을 하고, 어려운 상황에서 책임자를 부를 기준을 아는지 확인합니다.",
    writtenCount: 10,
    passScore: 8,
    practicalItems: [
      { id: "p1", text: "(예시) 오픈 준비를 체크 항목대로 혼자 끝낸다" },
      { id: "p2", text: "(예시) 마감을 체크 항목대로 혼자 끝낸다" },
      { id: "p3", text: "(예시) 불만·환불 상황 역할극에서 기준대로 응대하고 책임자에게 넘긴다" },
    ],
    note: "(예시) 1단계 인증 뒤에 봅니다. 인증과 승급·시급을 어떻게 이을지는 매장에서 따로 정합니다 (확인 필요).",
  },
];

export function getExams(content: { exams?: ExamDef[] } | null | undefined): ExamDef[] {
  return content?.exams ?? defaultExams;
}

// 화면이 받는 한 사람의 시험 상태
export type ExamAttempt = { score: number; total: number; created_at: string };
export type PracticalStatus = PracticalItem & { ready_at: string | null; passed_at: string | null; passed_by_name: string | null };
export type ExamStatus = ExamDef & {
  attempts: ExamAttempt[];
  best: ExamAttempt | null;
  writtenPassed: boolean;
  practical: PracticalStatus[];
  // 필기 합격 + 실기 전부 합격
  certified: boolean;
};

type CheckLike = { recipe_id: string; practiced_at: string | null; confirmed_at: string | null; confirmed_by_name: string | null };
type ResultLike = { examId: string; score: number; total: number; created_at: string };

// 서버(데이터 창고)와 미리보기(브라우저)가 같은 규칙으로 상태를 만든다
export function buildExamStatus(exams: ExamDef[], results: ResultLike[], checks: CheckLike[]): ExamStatus[] {
  const checkOf = new Map(checks.map((row) => [row.recipe_id, row]));
  return exams.map((exam) => {
    const attempts = results.filter((row) => row.examId === exam.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(({ score, total, created_at }) => ({ score, total, created_at }));
    const best = attempts.reduce<ExamAttempt | null>((top, row) => (!top || row.score > top.score ? row : top), null);
    // 열려 있는 레시피·매뉴얼이 적어 문제가 모자라게 나온 시험은 합격 기준도 같은 비율로 본다
    const writtenPassed = attempts.some((row) => row.score >= Math.ceil((exam.passScore / Math.max(1, exam.writtenCount)) * row.total));
    // 편집하다 남은 빈 줄은 항목으로 치지 않는다
    const practical = exam.practicalItems.filter((item) => item.text.trim()).map((item) => {
      const row = checkOf.get(examCheckKey(exam.id, item.id));
      return { ...item, ready_at: row?.practiced_at ?? null, passed_at: row?.confirmed_at ?? null, passed_by_name: row?.confirmed_by_name ?? null };
    });
    return { ...exam, attempts: attempts.slice(0, 5), best, writtenPassed, practical, certified: writtenPassed && practical.length > 0 && practical.every((item) => item.passed_at) };
  });
}
