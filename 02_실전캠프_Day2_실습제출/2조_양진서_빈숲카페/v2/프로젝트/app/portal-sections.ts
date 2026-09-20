// 빈숲 OS 홈의 큰 버튼 목록. 공개용 버전이라 구조만 둔다 — 실제 운영 내용·수치는 여기에 넣지 않는다.
// status: "open" 은 지금 열리는 영역, "soon" 은 자리만 잡아 둔 영역(준비 중).
// "운영 매뉴얼" 묶음은 전부 같은 문서 틀(app/manual)을 쓴다. 공개용 버전이라 안에는 가짜 예시 문서만 있다.

export type PortalSection = {
  id: string;
  title: string;
  description: string;
  href?: string;
  status: "open" | "soon";
  // owner 만 보이는 영역
  ownerOnly?: boolean;
  group: "지금 쓰는 것" | "운영 매뉴얼" | "사람·성장" | "관리";
};

export const portalSections: PortalSection[] = [
  { id: "recipes", group: "지금 쓰는 것", status: "open", href: "/recipes", title: "레시피", description: "메뉴별 정량·순서·주의사항, 사진·영상, 바뀐 레시피 확인, 레시피 물어보기" },
  { id: "training", group: "지금 쓰는 것", status: "open", href: "/recipes/training", title: "신입 교육 경로 · 퀴즈", description: "1일차·1주차·30일차 단계별로 문서 ‘읽었어요’, 메뉴 ‘만들어 봤음’ → 사장 ‘확인함’, 자동 퀴즈" },

  { id: "standard", group: "운영 매뉴얼", status: "open", href: "/manual/standard", title: "빈숲의 기준", description: "모토, 서비스 원칙, 해도 되는 판단과 하면 안 되는 행동" },
  { id: "open", group: "운영 매뉴얼", status: "open", href: "/manual/open", title: "오픈", description: "출근부터 영업 시작 승인까지" },
  { id: "middle", group: "운영 매뉴얼", status: "open", href: "/manual/middle", title: "미들", description: "피크 준비 · 피크 대응 · 회복 · 한가한 시간 업무" },
  { id: "close", group: "운영 매뉴얼", status: "open", href: "/manual/close", title: "마감", description: "고객 · 식품/장비 · 정산 · 시설/보안 마감" },
  { id: "service", group: "운영 매뉴얼", status: "open", href: "/manual/service", title: "고객응대 · 주문 · 결제", description: "응대북 — 상황별 ‘이렇게 말해요’ 카드. 입점부터 퇴점까지, 불만·환불·배달·어려운 상황" },
  { id: "hygiene", group: "운영 매뉴얼", status: "open", href: "/manual/hygiene", title: "위생 · 안전", description: "식품안전, 청소, 사고·비상 대응" },
  { id: "barista", group: "운영 매뉴얼", status: "open", href: "/manual/barista", title: "바리스타 기초", description: "원두, 분쇄도, 에스프레소 추출, 우유 스티밍" },
  { id: "equipment", group: "운영 매뉴얼", status: "open", href: "/manual/equipment", title: "기기 · 시설", description: "사용법, 세척, 고장 났을 때" },

  { id: "exam", group: "사람·성장", status: "open", href: "/exam", title: "시험 · 인증", description: "단계별 필기(자동 채점)와 실기(책임자가 직접 보고 합격). 평소엔 잠가 두고 시험 볼 때만 열기" },
  { id: "notice", group: "사람·성장", status: "open", href: "/notices", title: "공지 · 변경 이력", description: "레시피·매뉴얼이 바뀌면 여기 모이고, 하나씩 ‘확인했어요’" },

  { id: "menus", group: "관리", status: "open", ownerOnly: true, href: "/manage/menus", title: "메뉴 잠금 설정", description: "큰 메뉴마다 직원에게 열림/잠김 정하기" },
  { id: "changes", group: "관리", status: "open", ownerOnly: true, href: "/recipes/changes", title: "확인 현황", description: "바뀐 레시피·매뉴얼을 누가 확인했고 누가 안 봤는지" },
  { id: "staff", group: "관리", status: "open", ownerOnly: true, href: "/recipes/staff", title: "직원 계정 관리", description: "재직·중지, 역할" },
  { id: "admin", group: "관리", status: "open", ownerOnly: true, href: "/recipes/admin", title: "관리자 편집", description: "레시피·매뉴얼·교육 경로·시험 편집, 표에서 가져오기, 게시, 버전 복구" },
];
