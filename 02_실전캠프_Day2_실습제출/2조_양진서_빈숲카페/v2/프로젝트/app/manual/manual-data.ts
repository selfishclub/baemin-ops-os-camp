// 운영 매뉴얼 문서 틀. 레시피 말고 "일하는 방법"을 적는 문서 — 모든 영역이 같은 틀을 쓴다.
// 공개용 버전이라 아래 예시는 전부 가짜다. ○○ 자리에 매장 기준을 적는 "빈 양식"이고, 실제 운영 값·정책은 넣지 않는다.

export type ManualDoc = {
  id: string;
  // app/portal-sections.ts 의 영역 id (open, close …)
  sectionId: string;
  title: string;
  // 목록에 보이는 한 줄 설명
  summary: string;
  // 왜 하는지
  purpose: string;
  // 준비물·미리 알아 둘 것
  materials: string[];
  // 순서
  steps: string[];
  // 이러면 끝난 것 (완료 기준)
  doneCriteria: string[];
  // 하면 안 되는 것
  donts: string[];
  // 이럴 땐 바로 보고
  reportWhen: string[];
  updatedAt: string;
  // 마지막으로 바뀐 이유
  change: string;
};

// 같은 문서 틀을 쓰는 영역들 (시험·공지는 틀이 달라서 아직 준비 중)
export const manualSectionIds = ["standard", "open", "middle", "close", "service", "hygiene", "barista", "equipment"] as const;

export type ManualSectionId = (typeof manualSectionIds)[number];

export function isManualSection(value: string): value is ManualSectionId {
  return (manualSectionIds as readonly string[]).includes(value);
}

export const manualFieldLabels = {
  purpose: "왜 하나요",
  materials: "준비물 · 미리 알아 둘 것",
  steps: "순서",
  doneCriteria: "이러면 끝난 거예요 (완료 기준)",
  donts: "하면 안 되는 것",
  reportWhen: "이럴 땐 바로 보고",
} as const;

function example(sectionId: ManualSectionId, slug: string, title: string, summary: string, purpose: string, parts: Pick<ManualDoc, "materials" | "steps" | "doneCriteria" | "donts" | "reportWhen">): ManualDoc {
  return { id: `demo-${sectionId}-${slug}`, sectionId, title, summary, purpose, ...parts, updatedAt: "테스트", change: "기능 확인용 예시 문서" };
}

export const defaultManuals: ManualDoc[] = [
  example("standard", "motto", "예시 · 우리 매장의 기준", "모토와 서비스 원칙을 한 장으로", "새로 온 사람도 ‘이 매장은 무엇을 중요하게 여기는지’를 같은 말로 알 수 있게 합니다.", {
    materials: ["(예시) 매장 모토 한 문장: ○○"],
    steps: ["(예시) 모토를 읽는다: ○○", "(예시) 서비스 원칙 3가지를 읽는다: ○○ / ○○ / ○○", "(예시) 직원이 혼자 판단해도 되는 일과 물어봐야 하는 일을 구분한다"],
    doneCriteria: ["(예시) 모토와 원칙을 자기 말로 설명할 수 있다"],
    donts: ["(예시) 기준에 없는 일을 추측으로 처리하지 않는다"],
    reportWhen: ["(예시) 기준끼리 부딪히는 상황을 만났을 때"],
  }),
  example("open", "prep", "예시 · 오픈 준비 순서", "출근부터 영업 시작 전까지", "문을 열기 전에 빠뜨린 것이 없는지 같은 순서로 확인합니다.", {
    materials: ["(예시) 열쇠·출입 방법: ○○", "(예시) 오픈 체크 용지 또는 화면"],
    steps: ["(예시) 출근 기록을 남긴다", "(예시) 전원·조명·기기 예열: ○○ 순서로", "(예시) 재료 상태 확인: ○○", "(예시) 진열·청결 확인", "(예시) 영업 시작 전 책임자에게 확인받는다"],
    doneCriteria: ["(예시) 체크 항목이 모두 채워졌다", "(예시) 책임자가 영업 시작을 승인했다"],
    donts: ["(예시) 확인하지 않은 항목을 ‘했다’고 표시하지 않는다"],
    reportWhen: ["(예시) 기기가 켜지지 않을 때", "(예시) 재료 상태가 이상할 때"],
  }),
  example("open", "cash", "예시 · 영업 시작 전 결제 준비", "결제 기기와 시재 확인", "첫 손님부터 결제가 막히지 않게 합니다.", {
    materials: ["(예시) 결제 기기: ○○"],
    steps: ["(예시) 결제 기기 전원과 연결 확인", "(예시) 시재 확인: ○○ 기준", "(예시) 시험 결제는 하지 않고 화면 상태만 확인"],
    doneCriteria: ["(예시) 결제 화면이 정상으로 뜬다"],
    donts: ["(예시) 금액이 안 맞을 때 혼자 맞춰 넣지 않는다"],
    reportWhen: ["(예시) 시재가 기준과 다를 때"],
  }),
  example("middle", "peak", "예시 · 피크 시간 대응", "붐비기 전 준비와 붐빌 때 역할", "주문이 몰려도 순서와 품질이 흔들리지 않게 합니다.", {
    materials: ["(예시) 피크 전 채워 둘 것: ○○"],
    steps: ["(예시) 피크 ○○분 전에 재료·컵·얼음을 채운다", "(예시) 역할을 나눈다: 주문 / 제조 / 전달", "(예시) 밀리면 주문 받는 사람이 대기 안내를 한다", "(예시) 피크가 끝나면 자리·기기를 원래대로 돌린다"],
    doneCriteria: ["(예시) 피크 뒤 작업대가 정리되어 있다"],
    donts: ["(예시) 바쁘다고 정량·순서를 줄이지 않는다"],
    reportWhen: ["(예시) 재료가 피크 중에 떨어질 것 같을 때"],
  }),
  example("close", "closing", "예시 · 마감 순서", "마지막 손님부터 문 잠그기까지", "다음 날 오픈하는 사람이 바로 시작할 수 있게 마감합니다.", {
    materials: ["(예시) 마감 체크 용지 또는 화면"],
    steps: ["(예시) 마지막 주문 안내: ○○", "(예시) 식품·재료 정리와 보관: ○○", "(예시) 기기 세척·전원: ○○ 순서로", "(예시) 정산 기록", "(예시) 시설 점검 후 잠금"],
    doneCriteria: ["(예시) 체크 항목이 모두 채워졌다", "(예시) 정산 기록이 남아 있다"],
    donts: ["(예시) 세척을 다음 날로 미루지 않는다"],
    reportWhen: ["(예시) 정산 금액이 안 맞을 때", "(예시) 잠금 장치가 이상할 때"],
  }),
  example("service", "complaint", "예시 · 불만·환불 요청을 받았을 때", "직원이 혼자 해도 되는 범위와 넘겨야 하는 범위", "누가 받아도 같은 방식으로 응대하고, 판단이 필요한 일은 책임자에게 넘깁니다.", {
    materials: ["(예시) 직원이 바로 해 줄 수 있는 것: ○○"],
    steps: ["(예시) 끝까지 듣고 상황을 그대로 되짚어 말한다", "(예시) 바로 해 줄 수 있는 범위면 처리한다: ○○", "(예시) 범위를 넘으면 책임자에게 넘긴다", "(예시) 무슨 일이 있었는지 기록을 남긴다"],
    doneCriteria: ["(예시) 기록에 상황과 처리 내용이 남아 있다"],
    donts: ["(예시) 환불·보상을 혼자 약속하지 않는다 (기준은 책임자가 정함 — 확인 필요)"],
    reportWhen: ["(예시) 다친 사람이 있거나 위생 문제가 나온 경우"],
  }),
  example("hygiene", "daily", "예시 · 매일 하는 위생 점검", "손 씻기, 작업대, 보관 상태", "음식을 다루는 곳의 기본을 매일 같은 기준으로 확인합니다.", {
    materials: ["(예시) 점검 용지 또는 화면", "(예시) 세척·소독 용품: ○○"],
    steps: ["(예시) 작업 전 손 씻기", "(예시) 작업대·도구 상태 확인", "(예시) 보관 온도·날짜 표시 확인: ○○ 기준 (법정 기준은 확인 필요)", "(예시) 점검 결과를 적는다"],
    doneCriteria: ["(예시) 오늘 점검 기록이 남아 있다"],
    donts: ["(예시) 날짜가 지난 재료를 ‘괜찮아 보여서’ 쓰지 않는다"],
    reportWhen: ["(예시) 보관 온도가 기준을 벗어났을 때", "(예시) 다치거나 사고가 났을 때"],
  }),
  example("barista", "espresso", "예시 · 에스프레소 추출 기초", "추출 상태를 보고 맞추는 법", "맛이 흔들릴 때 무엇을 보고 어떻게 맞추는지 같은 기준을 갖습니다.", {
    materials: ["(예시) 기준 추출: ○○ (매장 기준을 적는 자리)"],
    steps: ["(예시) 분쇄·도징·탬핑을 기준대로 한다", "(예시) 추출 시간을 본다: 기준 ○○", "(예시) 기준에서 벗어나면 분쇄도를 조정한다", "(예시) 맛을 보고 기록한다"],
    doneCriteria: ["(예시) 추출이 기준 범위에 들어온다"],
    donts: ["(예시) 기준을 벗어난 샷을 그대로 내지 않는다"],
    reportWhen: ["(예시) 조정해도 기준에 안 들어올 때"],
  }),
  example("equipment", "trouble", "예시 · 기기가 고장 났을 때", "먼저 할 일과 연락 순서", "당황하지 않고 안전을 먼저 챙긴 뒤, 정해진 순서로 알립니다.", {
    materials: ["(예시) 기기별 연락처·설명서 위치: ○○"],
    steps: ["(예시) 안전을 먼저 확인한다 (물·전기·열)", "(예시) 설명서의 기본 조치만 해 본다", "(예시) 안 되면 책임자에게 알린다", "(예시) 그 메뉴를 잠시 멈출지 책임자가 정한다"],
    doneCriteria: ["(예시) 책임자가 상황을 알고 있다", "(예시) 고장 내용이 기록되어 있다"],
    donts: ["(예시) 기기를 직접 뜯거나 고치지 않는다"],
    reportWhen: ["(예시) 물이 새거나 타는 냄새가 날 때는 즉시"],
  }),
];

// 공식본에 매뉴얼이 아직 없으면(처음 상태) 예시 문서를 보여 준다
export function getManuals(content: { manuals?: ManualDoc[] } | null | undefined): ManualDoc[] {
  return content?.manuals ?? defaultManuals;
}

// 직원 화면·챗봇용: 편집하다 남은 빈 줄을 뺀 문서
export function readableManuals(content: { manuals?: ManualDoc[] } | null | undefined): ManualDoc[] {
  const clean = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);
  return getManuals(content).map((doc) => ({ ...doc, materials: clean(doc.materials), steps: clean(doc.steps), doneCriteria: clean(doc.doneCriteria), donts: clean(doc.donts), reportWhen: clean(doc.reportWhen) }));
}

export function newManualDoc(sectionId: ManualSectionId): ManualDoc {
  return { id: `manual-${Date.now()}`, sectionId, title: "새 문서", summary: "", purpose: "", materials: [], steps: [""], doneCriteria: [], donts: [], reportWhen: [], updatedAt: new Date().toISOString().slice(0, 10), change: "새로 만듦" };
}
