import styles from "./security.module.css";

// 레시피 등 카페 정보 유출 금지 안내.
// 화면에는 버튼 하나만 보이고, 누르면 전문이 펼쳐진다 (모든 페이지 바닥글 · 로그인 화면).
// 문구를 바꿀 때는 여기 한 곳만 고치면 된다. (법적 효력·표현은 전문가 확인 필요)

export const rightsHolder = "빈숲카페";

export const securityRules: { title: string; body: string }[] = [
  {
    title: "모든 권리는 빈숲카페에 있습니다",
    body: `이 사이트의 모든 레시피(재료·정량·제조 순서·커팅·포장·플레이팅 기준), 사진·영상, 교육 자료와 지침서, 그리고 화면 구성·문구·디자인·프로그램에 대한 모든 권리는 ${rightsHolder}에 있습니다. 직원에게는 근무 중 업무에 쓰는 것만 허락됩니다.`,
  },
  {
    title: "밖으로 가져가면 안 됩니다",
    body: "업무 목적 외 열람, 촬영·캡처·화면 녹화, 복사·인쇄물 반출, 카톡·SNS·메일·클라우드 등 외부 전송, 다른 사람이나 다른 매장에 제공·공개, 퇴사 후 사용을 금지합니다. 내 계정과 비밀번호를 다른 사람에게 알려 주는 것도 금지합니다.",
  },
  {
    title: "누가 봤는지 표시됩니다",
    body: "사진·영상에는 보는 사람의 이름과 날짜가 워터마크로 표시됩니다. 퇴사하거나 위반이 확인되면 계정은 즉시 중지됩니다.",
  },
  {
    title: "위반하면 이렇게 조치될 수 있습니다",
    body: "계정 즉시 중지와 함께, 근로계약·사내 규정에 따른 조치를 할 수 있고, 「부정경쟁방지 및 영업비밀보호에 관한 법률」·「저작권법」 등 관련 법령에 따라 손해배상 청구를 포함한 민·형사상 책임을 물을 수 있습니다.",
  },
  {
    title: "유출을 알게 되면",
    body: "레시피나 화면이 밖에 돌아다니는 것을 보면 바로 매장 책임자에게 알려 주세요.",
  },
];

export function SecurityNoticeFull() {
  return (
    <ol className={styles.rules}>
      {securityRules.map((rule) => (
        <li key={rule.title}>
          <strong>{rule.title}</strong>
          <span>{rule.body}</span>
        </li>
      ))}
    </ol>
  );
}

// 버튼 하나. 누르면 전문이 펼쳐진다 (JS 없이 동작)
export function SecurityNoticeButton() {
  return (
    <details className={styles.notice}>
      <summary><span>레시피 등 카페 정보 유출 금지</span></summary>
      <SecurityNoticeFull />
    </details>
  );
}

// 모든 페이지 바닥글
export function SecurityFooter() {
  return (
    <footer className={styles.footer}>
      <SecurityNoticeButton />
      <p>© {rightsHolder}</p>
    </footer>
  );
}
