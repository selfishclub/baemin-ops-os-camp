// 출처 꼬리표 — 다른 사장님 도구에서 가져온 틀·계산식이면 카드 제목 옆에 붙인다.
// "어디서 온 건지"가 화면에서 바로 보이게. 규칙 탭 사용법에 전체 목록이 있다.
export type Source = "카페스이" | "유승균" | "ReTi" | "김씨육면" | "배민아카데미";

const META: Record<Source, { label: string; title: string; cls: string }> = {
  카페스이: { label: "카페스이 틀", title: "카페스이(손민지 사장님) 리뷰 모음소·대표 키워드·월말회의 표의 틀을 가져왔어요", cls: "bg-pink-100 text-pink-800" },
  유승균: { label: "배달이익노트", title: "마선생얼큰국밥(유승균 사장님) 배달이익노트의 계산식·수집 방식을 가져왔어요", cls: "bg-sky-100 text-sky-800" },
  ReTi: { label: "ReTi AI 참고", title: "바삭마차(이승신 사장님) ReTi AI의 화면 구성을 참고했어요", cls: "bg-violet-100 text-violet-800" },
  배민아카데미: { label: "배민아카데미 교육", title: "배민아카데미 네이버 키워드 교육(스시도쿠 강의)의 1등·2등 지역, 조합, 대표상호 키워드 판정 틀을 가져왔어요. 강의 내용은 담지 않고 판정 기준만 씁니다", cls: "bg-teal-100 text-teal-800" },
  김씨육면: { label: "김씨육면 참고", title: "김씨육면(오지영 사장님) 손익관리의 메뉴 구성·글꼴을 참고했어요", cls: "bg-amber-100 text-amber-800" },
};

export function SourceTag({ from }: { from: Source }) {
  const m = META[from];
  return (
    <span title={m.title} className={`ml-1.5 inline-block rounded px-1.5 py-0.5 align-middle text-[10px] font-bold ${m.cls}`}>
      {m.label}
    </span>
  );
}
