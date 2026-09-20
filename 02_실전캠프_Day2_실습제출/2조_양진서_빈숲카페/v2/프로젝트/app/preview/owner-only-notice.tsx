import Link from "next/link";
import PreviewRoleSwitch from "./preview-role-switch";

// 미리보기에서 "직원 눈으로" 보는 중에 사장 전용 화면을 열었을 때.
// 실제(로그인) 모드에서는 직원이 이 주소를 열면 홈으로 돌려보낸다.
export default function OwnerOnlyNotice({ title }: { title: string }) {
  return (
    <main style={{ display: "grid", minHeight: "70dvh", placeContent: "center", justifyItems: "center", gap: 12, padding: 24, textAlign: "center", color: "#29332c" }}>
      <h1 style={{ margin: 0, fontSize: 22, color: "#173f31" }}>{title} 화면은 사장님만 볼 수 있어요</h1>
      <p style={{ margin: 0, maxWidth: 380, color: "#697269", fontSize: 14, lineHeight: 1.7 }}>
        지금은 미리보기에서 <strong>직원 눈으로</strong> 보는 중이에요. 실제로는 직원이 이 주소를 직접 열어도 홈으로 돌려보내요.
        이 화면을 보려면 아래에서 ‘사장 눈으로’를 누르세요.
      </p>
      <PreviewRoleSwitch role="staff" />
      <p style={{ margin: "4px 0 0" }}><Link href="/" style={{ color: "#2f6b47", fontWeight: 800, fontSize: 14 }}>← 빈숲 OS 홈</Link></p>
    </main>
  );
}
