/** §6 고정비 템플릿 — 매월 복사 시드
 *  금액은 공개 저장소에 올리지 않으므로 기본값 0. 실제 금액은 설정 화면(고정비 템플릿)에서 넣는다. */
export interface FixedTemplateItem {
  account: string;
  sub: string;
  amount: number;
  /** 매월 금액이 달라져 복사 후 수정이 필요한 항목 */
  editable: boolean;
  range?: [number, number];
  note?: string;
}

export const DEFAULT_FIXED_TEMPLATE: FixedTemplateItem[] = [
  { account: "임대료", sub: "월세", amount: 0, editable: false },
  { account: "고정운영비", sub: "테이블오더", amount: 0, editable: false },
  { account: "고정운영비", sub: "세무사", amount: 0, editable: false },
  { account: "고정운영비", sub: "노란우산", amount: 0, editable: false, note: "5월부터" },
  { account: "고정운영비", sub: "방역", amount: 0, editable: false },
  { account: "공과금", sub: "화재보험", amount: 0, editable: false },
  { account: "고정운영비", sub: "정수기", amount: 0, editable: false },
  { account: "기부", sub: "월드비전", amount: 0, editable: false },
  { account: "공과금", sub: "전기료", amount: 0, editable: true },
  { account: "공과금", sub: "도시가스", amount: 0, editable: true },
  { account: "공과금", sub: "수도료", amount: 0, editable: true },
  { account: "공과금", sub: "인터넷비", amount: 0, editable: true },
];

let templateRegistry: FixedTemplateItem[] = [...DEFAULT_FIXED_TEMPLATE];

export function configureFixedTemplate(items: FixedTemplateItem[]) {
  templateRegistry = [...items];
}

/** 설정 화면에서 고칠 수 있으므로 항상 이 함수로 읽는다 */
export const fixedTemplate = (): FixedTemplateItem[] => [...templateRegistry];

export const prevMonthOf = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
