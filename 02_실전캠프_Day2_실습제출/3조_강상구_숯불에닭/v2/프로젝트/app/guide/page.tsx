import Link from "next/link";

// 사용법 — 어디에 무엇을 넣고, 어디서 숫자를 가져오나. 문서가 아니라 앱 안에 둔다.
const STEPS: { title: string; when: string; items: { text: string; href?: string; label?: string }[] }[] = [
  {
    title: "처음 한 번 — 설정 (10분)",
    when: "앱을 처음 열었을 때",
    items: [
      { text: "오늘 탭 → “직원·채널 설정”에서 시급제 직원의 별칭(홀A·화덕A)과 시급 등록. 실명은 넣지 않아요.", href: "/today", label: "오늘 탭" },
      { text: "같은 화면에서 배달앱·현금 채널 확인. 카드사는 오늘 탭에서 “+ 카드사 추가”로 고르면 자동으로 생겨요." },
      { text: "정산 탭 → “정산 규칙 등록하기”. 채널마다 ‘매출일 + N영업일’ 또는 ‘주 단위(요일)’. 모르면 “기본 규칙 넣기”로 시작하고, 차이·미입금이 계속 뜨는 채널만 고치면 돼요.", href: "/channels", label: "정산 탭" },
      { text: "원가율 탭 → “품목·레시피 설정”에서 재료(품목)와 기준단가(대략값), 메뉴별 레시피(품목 + g/ml/개). 포스 상품코드를 같이 적어야 판매 자료와 맞춰져요. 이미 만든 레시피 파일(JSON)이 있으면 “가져오기”로 한 번에.", href: "/costing", label: "원가율 탭" },
    ],
  },
  {
    title: "매일 마감 때 — 1분",
    when: "장사 끝나고",
    items: [
      { text: "오늘 탭에서 포스 마감정산서의 ‘결제수단별 매출내역’을 옮겨요: 신용카드 → 카드 칸(“+ 카드사 추가”로 카드사를 고르고 맨 아래 ‘카드사별 매출내역’ 숫자를 옆에), 일반현금·현금영수증 → 홀 현금, 간편결제 → 간편결제. 배달앱은 각 앱 사장님 앱의 오늘 주문금액(수수료 빼기 전).", href: "/today", label: "오늘 탭" },
      { text: "카드는 매일 넣는 대신 포스 ASP → 매출관리 → 승인현황(카드승인현황)을 기간으로 뽑아 오늘 탭 카드 칸의 “카드승인현황 파일 올리기”에 올리면 날짜별·카드사별로 한 번에 들어가요(영업일자 기준, 취소 건은 뺌)." },
      { text: "알바는 별칭 고르고 출근·퇴근 시각을 넣으면 근무시간이 계산돼요(자정 넘김도 OK). 다음 날엔 전날 시각이 미리 들어와요. 어림 인건비와 인건비율이 바로 나와요." },
      { text: "빠뜨린 날은 달력의 회색 날짜를 눌러 나중에 채워요." },
      { text: "날씨는 자동으로 붙어요. 오늘 탭 아래 “날씨 × 매출” 카드에서 비 오는 날 배달이 얼마나 느는지, 이번 주 예보별 예상 매출을 봐요.", href: "/weather", label: "날씨" },
    ],
  },
  {
    title: "매달 초 — 20분",
    when: "지난달 정산할 때",
    items: [
      { text: "은행 사이트에서 지난달 1일~이달 초까지 거래내역을 엑셀로 내려받아 올리기 탭에 올리기. 파일은 이 화면 안에서만 읽어요.", href: "/upload", label: "올리기 탭" },
      { text: "“확인 필요” 줄만 분류 고르기. 한 번 고르면 다음 달부터 자동. 통장에 안 찍힌 현금·다른 카드 지출은 같은 화면 아래 “지출 추가”에." },
      { text: "정산 탭에서 채널별 수수료율과 “미입금(지남)”을 확인. 규칙이 없는 채널만 주문금액·정산금액을 직접 넣어요.", href: "/channels", label: "정산 탭" },
      { text: "원가율 탭에 포스 ASP → 매출관리 → 매출분석 → 상품ABC분석(지난달 1일~말일) 엑셀 올리기 → 이론 원가율 vs 통장 원가율.", href: "/costing", label: "원가율 탭" },
      { text: "손익 탭에서 임대료까지 들어간 영업이익 확인 → “이번 달 마감”. 마감 뒤 고치면 기록이 남아요.", href: "/", label: "손익 탭" },
      { text: "내 PC 모드면 규칙 탭에서 “백업 파일 저장”. 브라우저 기록을 지우면 데이터가 사라져요.", href: "/rules", label: "규칙 탭" },
    ],
  },
];

export default function GuidePage() {
  return (
    <>
      <section className="card space-y-2">
        <h2 className="text-base font-bold">사용법 — 어디에 무엇을 넣나</h2>
        <p className="text-sm text-stone-600">
          기준은 하나예요. <b>매출·수수료는 주문한 날</b>, <b>비용은 통장에서 나간 날</b>. 실제 숫자는 내 PC 모드(초록 띠)에서만 넣고, 시연 모드(주황 띠)에는 가짜 숫자만 넣어요.
        </p>
        <p className="text-sm text-stone-600">
          처음이면 <Link href="/today" className="font-bold text-orange-700 underline">오늘 탭</Link>의 “가짜 예시 자료 넣기”, <Link href="/upload" className="font-bold text-orange-700 underline">올리기 탭</Link>의 “가짜 9월 파일”, <Link href="/costing" className="font-bold text-orange-700 underline">원가율 탭</Link>의 “가짜 품목·레시피 넣기”로 한 바퀴 돌아 보세요.
        </p>
      </section>
      {STEPS.map((s) => (
        <section key={s.title} className="card space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-bold">{s.title}</h3>
            <span className="text-[11px] text-stone-500">{s.when}</span>
          </div>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-stone-700">
            {s.items.map((it, i) => (
              <li key={i}>
                {it.text}{" "}
                {it.href && (
                  <Link href={it.href} className="whitespace-nowrap text-[11px] font-bold text-orange-700 underline">
                    {it.label} →
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
      <section className="card text-xs text-stone-500">
        <p>화면마다 위쪽의 <b>?</b> 줄을 누르면 그 화면의 안내가 펼쳐져요. 이 페이지는 규칙 탭 맨 위에서 다시 열 수 있어요.</p>
      </section>
    </>
  );
}
