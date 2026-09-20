// 운영 매뉴얼 문서 틀. 레시피 말고 "일하는 방법"을 적는 문서 — 모든 영역이 같은 틀을 쓴다.
// 공개용 버전이라 아래 예시는 전부 가짜다. ○○ 자리에 매장 기준을 적는 "빈 양식"이고, 실제 운영 값·정책은 넣지 않는다.

// 문서 종류. procedure = 일하는 순서를 적는 절차 문서, response = 손님에게 "이렇게 말해요"를 적는 응대 카드.
// 응대 카드는 같은 칸을 다른 이름으로 쓴다 (manualLabels 참고): purpose=상황, steps=이렇게 말해요,
// donts=이렇게는 말하지 않아요, doneCriteria=직원이 혼자 해도 되는 범위, reportWhen=책임자를 부르는 기준. materials 는 쓰지 않는다.
export type ManualKind = "procedure" | "response";

export type ManualDoc = {
  id: string;
  // 없으면 절차 문서
  kind?: ManualKind;
  // 응대북의 묶음 (기본 흐름, 주문 상황 …). 목록에서 이 이름으로 묶여 보인다
  group?: string;
  // 챗봇이 알아듣는 낱말 (제목에 없는 말로 물어도 찾게)
  keywords?: string[];
  // 매일 체크하는 문서 (오픈·마감 체크처럼). 켜면 "순서"의 각 줄이 오늘 체크 항목이 되고, 누가 언제 했는지 남는다
  dailyCheck?: boolean;
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

const responseLabels = {
  purpose: "어떤 상황인가요",
  materials: "",
  steps: "이렇게 말해요",
  doneCriteria: "직원이 혼자 해도 되는 범위",
  donts: "이렇게는 말하지 않아요",
  reportWhen: "이럴 땐 책임자를 불러요",
} as const;

// 문서 종류에 맞는 칸 이름
export function manualLabels(kind: ManualKind | undefined) {
  return kind === "response" ? responseLabels : manualFieldLabels;
}

// 응대북 묶음 (목록에 이 순서로 보인다)
export const responseGroups = ["기본 흐름", "주문 상황", "결제", "불만", "매장 이용 안내", "배달 · 포장 · 전화", "어려운 상황"] as const;

function card(slug: string, group: (typeof responseGroups)[number], title: string, keywords: string[], situation: string, say: string[], dontSay: string[], staffCan: string[], callManager: string[]): ManualDoc {
  return { id: `demo-service-${slug}`, kind: "response", sectionId: "service", group, title, keywords, summary: situation, purpose: situation, materials: [], steps: say, donts: dontSay, doneCriteria: staffCan, reportWhen: callManager, updatedAt: "테스트", change: "기능 확인용 예시 카드" };
}

// 응대북 예시 카드. 전부 가짜 — 말투와 기준은 매장에서 정해 ○○ 자리에 적는다. 법·보상 기준처럼 판단이 필요한 값은 비워 둔다.
const responseCards: ManualDoc[] = [
  card("greeting", "기본 흐름", "예시 · 입점 인사와 주문 받기", ["인사", "어서오세요", "주문받"], "손님이 들어와 주문할 때",
    ["(예시) 어서 오세요, ○○입니다.", "(예시) 주문 도와드릴게요. 드시고 가세요, 가져가세요?", "(예시) 주문 확인할게요. ○○ 한 잔, 맞으세요?"],
    ["(예시) 손님을 보지 않고 인사하지 않는다", "(예시) 주문을 되짚지 않고 바로 결제하지 않는다"],
    ["(예시) 메뉴·옵션 안내"], ["(예시) 메뉴판에 없는 요청을 받았을 때"]),
  card("handover", "기본 흐름", "예시 · 음료 전달과 퇴점 인사", ["전달", "나왔습니다", "퇴점", "안녕히"], "음료를 내어 드리고 손님이 나갈 때",
    ["(예시) 주문하신 ○○ 나왔습니다.", "(예시) 뜨거우니 조심하세요.", "(예시) 감사합니다, 또 오세요."],
    ["(예시) 메뉴 이름 없이 “나왔어요”만 말하지 않는다"],
    ["(예시) 빨대·컵홀더 등 기본 제공품 안내"], ["(예시) 전달한 음료가 주문과 다르다고 할 때 → ‘음료가 잘못 나갔을 때’ 카드"]),

  card("recommend", "주문 상황", "예시 · 메뉴 추천을 부탁받았을 때", ["추천", "뭐가맛있", "인기"], "“뭐가 맛있어요?” 하고 물을 때",
    ["(예시) 단 걸 좋아하세요, 덜 단 걸 좋아하세요?", "(예시) 그러면 ○○를 많이 찾으세요."],
    ["(예시) “다 맛있어요”로 끝내지 않는다"],
    ["(예시) 매장에서 정한 추천 메뉴 안내: ○○"], ["(예시) 없음"]),
  card("soldout", "주문 상황", "예시 · 품절일 때", ["품절", "다떨어", "재료소진"], "주문한 메뉴의 재료가 떨어졌을 때",
    ["(예시) 죄송합니다, ○○는 오늘 재료가 다 떨어졌어요.", "(예시) 비슷한 메뉴로 ○○는 어떠세요?"],
    ["(예시) “없어요” 한마디로 끝내지 않는다"],
    ["(예시) 비슷한 메뉴 제안"], ["(예시) 이미 결제한 뒤에 품절을 알았을 때"]),
  card("allergy", "주문 상황", "예시 · 알레르기·성분을 물어볼 때", ["알레르기", "알러지", "성분", "들어가나요", "우유들어", "견과"], "“여기 ○○ 들어가나요?” 하고 물을 때",
    ["(예시) 확인하고 말씀드릴게요, 잠시만요.", "(예시) 레시피에 적힌 재료는 ○○입니다. 원재료 표시는 직접 보여 드릴게요."],
    ["(예시) 모르는데 “안 들어가요”, “괜찮을 거예요”라고 말하지 않는다"],
    ["(예시) 레시피와 원재료 표시에 적힌 내용 그대로 안내"], ["(예시) 표시로 확인이 안 될 때", "(예시) 손님이 먹고 이상이 있다고 할 때는 즉시"]),
  card("waiting", "주문 상황", "예시 · 대기가 길어질 때", ["대기", "오래걸", "언제나와", "기다"], "주문이 밀려 평소보다 오래 걸릴 때",
    ["(예시) 지금 주문이 많아서 ○○분 정도 걸릴 것 같아요. 괜찮으세요?", "(예시) 오래 기다리셨습니다, 감사합니다."],
    ["(예시) 걸리는 시간을 말하지 않고 주문만 받지 않는다"],
    ["(예시) 예상 시간 안내"], ["(예시) 기다리다 취소·환불을 요청할 때"]),

  card("pay-error", "결제", "예시 · 결제가 안 될 때", ["결제오류", "결제안", "카드안", "승인"], "카드·간편결제가 승인되지 않을 때",
    ["(예시) 승인이 안 됐다고 나와요. 다시 한번 해 볼게요.", "(예시) 다른 결제 수단이 있으실까요?"],
    ["(예시) “카드가 이상한데요”처럼 손님 탓으로 말하지 않는다"],
    ["(예시) 다시 시도, 다른 수단 안내"], ["(예시) 결제는 됐는데 기기에 안 뜰 때", "(예시) 같은 결제가 두 번 된 것 같을 때"]),
  card("coupon", "결제", "예시 · 쿠폰·적립 문의", ["쿠폰", "적립", "스탬프", "할인"], "쿠폰·적립·할인을 물어볼 때",
    ["(예시) 적립은 ○○ 방식으로 해 드리고 있어요.", "(예시) 이 쿠폰은 ○○ 조건이라 지금은 어려워요. 죄송합니다."],
    ["(예시) 기준에 없는 할인을 그 자리에서 약속하지 않는다"],
    ["(예시) 정해진 쿠폰·적립 기준 안내: ○○"], ["(예시) 기준에 없는 요청일 때"]),

  card("wrong-drink", "불만", "예시 · 음료가 잘못 나갔을 때", ["잘못나", "다른메뉴", "주문한거아닌"], "주문과 다른 음료가 나갔다고 할 때",
    ["(예시) 죄송합니다. 바로 다시 만들어 드릴게요.", "(예시) 주문 내용 한 번만 다시 확인할게요."],
    ["(예시) “그렇게 주문하셨는데요”로 시작하지 않는다"],
    ["(예시) 다시 만들어 드리기"], ["(예시) 같은 손님에게 두 번 이상 반복될 때"]),
  card("refund", "불만", "예시 · 환불을 요청할 때", ["환불", "돈돌려", "취소해"], "맛·서비스 불만으로 환불을 요청할 때",
    ["(예시) 불편을 드려 죄송합니다. 어떤 점이 그러셨는지 여쭤봐도 될까요?", "(예시) 책임자에게 바로 확인해서 안내해 드릴게요."],
    ["(예시) 환불·보상을 혼자 약속하지 않는다", "(예시) “규정상 안 돼요”로 끊지 않는다"],
    ["(예시) 끝까지 듣기, 다시 만들어 드리기 제안"], ["(예시) 환불·보상 요청은 모두 (기준은 책임자가 정함 — 확인 필요)"]),
  card("foreign-object", "불만", "예시 · 이물질이 나왔다고 할 때", ["이물질", "머리카락", "뭐가나왔"], "음료·음식에서 이물질이 나왔다고 할 때",
    ["(예시) 정말 죄송합니다. 바로 확인하겠습니다.", "(예시) 드시던 것은 그대로 두시면 제가 가져갈게요."],
    ["(예시) “그럴 리가 없는데요”라고 말하지 않는다"],
    ["(예시) 사과, 제품 회수, 상황 기록"], ["(예시) 이물질 건은 모두 즉시", "(예시) 몸에 이상이 있다고 할 때는 즉시"]),

  card("seat", "매장 이용 안내", "예시 · 자리·콘센트·외부 음식·오래 머무는 손님", ["자리", "콘센트", "외부음식", "오래머무", "이용시간"], "매장 이용 규칙을 안내해야 할 때",
    ["(예시) 죄송하지만 매장에서는 ○○ 부탁드리고 있어요.", "(예시) 콘센트는 ○○ 자리에 있어요."],
    ["(예시) 다른 손님 앞에서 면박 주듯 말하지 않는다"],
    ["(예시) 정해진 매장 규칙 안내: ○○"], ["(예시) 안내했는데도 계속될 때"]),

  card("delivery", "배달 · 포장 · 전화", "예시 · 배달 주문이 누락·지연됐을 때", ["배달", "누락", "라이더", "안왔"], "배달 손님·라이더에게 누락·지연 연락을 받았을 때",
    ["(예시) 불편을 드려 죄송합니다. 주문 번호 확인 부탁드려요.", "(예시) 확인해서 ○○분 안에 다시 연락드릴게요."],
    ["(예시) 확인 전에 “저희 잘못 아니에요”라고 말하지 않는다"],
    ["(예시) 주문 내역 확인, 상황 기록"], ["(예시) 다시 보내기·환불이 필요할 때"]),
  card("phone", "배달 · 포장 · 전화", "예시 · 전화 주문·문의", ["전화", "포장주문", "예약"], "전화로 주문·문의가 왔을 때",
    ["(예시) 감사합니다, ○○입니다.", "(예시) ○○ ○잔, ○시에 찾으러 오시는 걸로 받았습니다. 성함 부탁드려요."],
    ["(예시) 바쁘다고 말없이 끊지 않는다"],
    ["(예시) 정해진 범위의 포장 주문 받기"], ["(예시) 단체 주문·예약 문의"]),
  card("review", "배달 · 포장 · 전화", "예시 · 리뷰에 답글을 달아야 할 때", ["리뷰", "답글", "별점"], "배달앱·지도에 리뷰가 올라왔을 때",
    ["(예시) 직원은 답글을 직접 달지 않고 내용을 책임자에게 전달한다"],
    ["(예시) 개인 계정으로 반박 글을 쓰지 않는다"],
    ["(예시) 리뷰 내용 전달"], ["(예시) 나쁜 리뷰·사실과 다른 리뷰는 모두"]),

  card("abuse", "어려운 상황", "예시 · 폭언하거나 취한 손님", ["폭언", "욕설", "취객", "취한", "소리지"], "손님이 소리를 지르거나 위협적으로 행동할 때",
    ["(예시) 불편하신 점은 책임자가 바로 도와드리겠습니다.", "(예시) 잠시만 기다려 주세요."],
    ["(예시) 같이 언성을 높이지 않는다", "(예시) 혼자 해결하려고 가까이 다가가지 않는다"],
    ["(예시) 거리를 두고 책임자 부르기"], ["(예시) 즉시. 위험하다고 느끼면 안전이 먼저 (신고 기준은 확인 필요)"]),
  card("injury", "어려운 상황", "예시 · 다친 손님·분실물", ["다쳤", "넘어", "데었", "분실", "두고간"], "손님이 다쳤거나 물건을 두고 갔을 때",
    ["(예시) 괜찮으세요? 움직이지 마시고 잠시만요.", "(예시) 두고 가신 물건은 ○○에 보관하고 있어요."],
    ["(예시) 다친 원인을 그 자리에서 단정해 말하지 않는다"],
    ["(예시) 상태 확인, 분실물 보관·기록"], ["(예시) 다친 손님은 모두 즉시", "(예시) 귀중품 분실물"]),
];

// 매일 체크하는 예시 문서
const dailyExamples = new Set(["demo-open-prep", "demo-close-closing", "demo-hygiene-daily"]);

function example(sectionId: ManualSectionId, slug: string, title: string, summary: string, purpose: string, parts: Pick<ManualDoc, "materials" | "steps" | "doneCriteria" | "donts" | "reportWhen">): ManualDoc {
  return { id: `demo-${sectionId}-${slug}`, ...(dailyExamples.has(`demo-${sectionId}-${slug}`) ? { dailyCheck: true } : {}), sectionId, title, summary, purpose, ...parts, updatedAt: "테스트", change: "기능 확인용 예시 문서" };
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
  // 고객응대 영역은 절차 문서 대신 응대 카드(응대북)를 쓴다
  ...responseCards,
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

// 바뀐 문서 알림: 알림 표(recipe_change_notices.recipe_id)에 매뉴얼 문서를 적을 때 쓰는 열쇠. 레시피는 레시피 id 그대로.
export const manualNoticePrefix = "manual:";

// 이전 공식본과 비교해 내용이 바뀌었거나 새로 생긴 문서 (게시할 때 직원에게 "확인했어요"를 받을 단위)
export function changedManuals(previous: { manuals?: ManualDoc[] } | null | undefined, next: { manuals?: ManualDoc[] } | null | undefined): ManualDoc[] {
  const before = new Map(readableManuals(previous).map((doc) => [doc.id, JSON.stringify(doc)]));
  return readableManuals(next).filter((doc) => before.get(doc.id) !== JSON.stringify(doc));
}

// 직원 화면·챗봇용: 편집하다 남은 빈 줄을 뺀 문서
export function readableManuals(content: { manuals?: ManualDoc[] } | null | undefined): ManualDoc[] {
  const clean = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);
  return getManuals(content).map((doc) => ({ ...doc, materials: clean(doc.materials), steps: clean(doc.steps), doneCriteria: clean(doc.doneCriteria), donts: clean(doc.donts), reportWhen: clean(doc.reportWhen) }));
}

export function newManualDoc(sectionId: ManualSectionId, kind: ManualKind = "procedure"): ManualDoc {
  return { id: `manual-${Date.now()}`, kind, ...(kind === "response" ? { group: responseGroups[0], keywords: [] } : {}), sectionId, title: kind === "response" ? "새 응대 카드" : "새 문서", summary: "", purpose: "", materials: [], steps: [""], doneCriteria: [], donts: [], reportWhen: [], updatedAt: new Date().toISOString().slice(0, 10), change: "새로 만듦" };
}
