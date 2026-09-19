import Link from "next/link";

// 잠긴 영역에 직원이 들어왔을 때 보이는 화면
export default function LockedNotice({ title }: { title: string }) {
  return (
    <main style={{ display: "grid", minHeight: "70dvh", placeContent: "center", justifyItems: "center", gap: 10, padding: 24, textAlign: "center", color: "#29332c" }}>
      <span aria-hidden="true" style={{ display: "grid", width: 56, height: 56, placeItems: "center", borderRadius: "50%", background: "#ece9df", fontSize: 24 }}>🔒</span>
      <h1 style={{ margin: 0, fontSize: 22, color: "#173f31" }}>{title} 영역은 지금 잠겨 있어요</h1>
      <p style={{ margin: 0, maxWidth: 360, color: "#697269", fontSize: 14, lineHeight: 1.7 }}>
        평상시에는 잠가 두고, 교육이나 확인이 필요할 때만 매장 책임자가 열어요. 필요하면 열어 달라고 요청해 주세요.
      </p>
      <p style={{ margin: "8px 0 0" }}><Link href="/" style={{ color: "#2f6b47", fontWeight: 800, fontSize: 14 }}>← 빈숲 OS 홈</Link></p>
    </main>
  );
}
