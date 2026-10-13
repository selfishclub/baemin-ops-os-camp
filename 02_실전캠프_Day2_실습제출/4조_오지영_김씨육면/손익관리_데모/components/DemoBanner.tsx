"use client";

import { useState } from "react";
import { seedDemo } from "@/lib/demoSeed";

/**
 * 데모판 안내 — 가짜 자료라는 것, 처음 상태로 돌리는 법, 어디부터 눌러 보면 되는지.
 */
export function DemoBanner({ onScene }: { onScene: (scene: "A" | "B" | "C") => void }) {
  const [open, setOpen] = useState(true);
  const scenes: { k: "A" | "B" | "C"; title: string; desc: string }[] = [
    { k: "A", title: "대시보드", desc: "7·8·9월 매출·비용·영업이익 흐름을 한눈에" },
    { k: "B", title: "9월 지출 분류", desc: "앱이 붙인 제안을 확정하고, 미분류는 드롭다운으로 골라 보기" },
    { k: "C", title: "8월 월 요약", desc: "손익계산서 모양 · 프라임코스트 · 고정/변동" },
  ];
  return (
    <div style={{ background: "var(--primary-soft)", borderBottom: "1px solid var(--line-2)", padding: "10px 20px", fontSize: 14, color: "var(--ink)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ color: "var(--primary)" }}>데모판</b>
        <span>숫자·거래처는 전부 지어낸 가짜 자료예요. 고친 내용은 이 브라우저에만 남아요.</span>
        <span style={{ flex: 1 }} />
        <button className="tb-pill" style={{ flex: "none" }} onClick={() => setOpen((o) => !o)}>
          {open ? "안내 접기" : "👉 여기부터 눌러 보세요"}
        </button>
        <button
          className="tb-pill"
          style={{ flex: "none" }}
          onClick={() => {
            if (!confirm("데모 자료를 처음 상태로 다시 채울까요? 둘러보며 고친 내용은 사라져요.")) return;
            seedDemo();
            window.location.reload();
          }}
        >
          ↺ 데모 데이터 다시 채우기
        </button>
      </div>
      {open && (
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          {scenes.map((s) => (
            <button
              key={s.k}
              onClick={() => onScene(s.k)}
              style={{ flex: "1 1 220px", textAlign: "left", background: "var(--card)", border: "1px solid var(--line-2)", borderRadius: 12, padding: "10px 14px", cursor: "pointer", color: "var(--ink)" }}
            >
              <div style={{ fontWeight: 700 }}>
                <span style={{ color: "var(--primary)" }}>장면 {s.k}</span> · {s.title}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{s.desc}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
