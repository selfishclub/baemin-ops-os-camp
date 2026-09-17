"use client";

import { useState } from "react";
import type { ProviderInfo } from "@/lib/ai/client";
import type { Settings } from "@/lib/types";

const FIELDS: { key: keyof Settings; label: string; placeholder: string; textarea?: boolean; hint?: string }[] = [
  { key: "storeName", label: "가게 이름", placeholder: "예: 마선생얼큰국밥" },
  { key: "brandName", label: "브랜드/별칭 (선택)", placeholder: "예: 마선생" },
  { key: "region", label: "지역", placeholder: "예: ○○동 ○○역 앞" },
  { key: "signatureMenus", label: "대표 메뉴", placeholder: "예: 얼큰국밥, 순대국밥" },
  { key: "tone", label: "말투", placeholder: "예: 따뜻하고 담백한 사장님 말투" },
  { key: "instagramHandle", label: "인스타그램", placeholder: "예: @가게계정" },
  { key: "naverPlaceUrl", label: "네이버 플레이스 주소", placeholder: "예: https://naver.me/xxxx 또는 https://m.place.naver.com/restaurant/123456", hint: "네이버 리뷰 수집에 사용" },
  { key: "baeminReviewUrl", label: "배민 리뷰 페이지 주소 (선택)", placeholder: "비워두면 self.baemin.com 에서 직접 리뷰 메뉴를 열어주면 됩니다", hint: "배민 사장님 사이트에서 리뷰 화면 주소를 복사해 넣으면 바로 이동합니다" },
  { key: "coupangReviewUrl", label: "쿠팡이츠 리뷰 페이지 주소 (선택)", placeholder: "비워두면 store.coupangeats.com 에서 직접 리뷰 메뉴를 열어주면 됩니다" },
  { key: "extraNotes", label: "AI에게 알려줄 참고 사항", placeholder: "예: 김구이는 매일 300장 직접 구움. 밀키트 전국택배 가능. '최고' 같은 과장 표현은 쓰지 않음", textarea: true },
];

export function SettingsForm({ initial, providers, ingestUrl, cloud = false }: { initial: Settings; providers: ProviderInfo[]; ingestUrl: string; cloud?: boolean }) {
  const [form, setForm] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message);
      setForm(data.settings);
      setMsg("저장했습니다.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="card flex flex-col gap-3 p-5">
        <h2 className="text-lg font-bold">가게 정보</h2>
        <p className="text-xs text-[var(--muted)]">AI가 콘텐츠를 만들 때 이 정보만 사용합니다. 여기 없는 내용은 지어내지 않습니다.</p>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="label" htmlFor={f.key}>{f.label}</label>
            {f.textarea ? (
              <textarea id={f.key} className="textarea" rows={4} placeholder={f.placeholder} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            ) : (
              <input id={f.key} className="input" placeholder={f.placeholder} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            )}
            {f.hint ? <p className="mt-1 text-[11px] text-[var(--muted)]">{f.hint}</p> : null}
          </div>
        ))}
        <div className="flex items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>{saving ? "저장 중…" : "저장"}</button>
          {msg ? <span className="text-sm text-[var(--muted)]">{msg}</span> : null}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="card p-4 text-sm">
          <h3 className="font-bold">AI 연결 상태</h3>
          {providers.length ? (
            <ul className="mt-2 list-disc pl-5">
              {providers.map((p) => (
                <li key={p.provider}>
                  {p.provider === "anthropic" ? "Anthropic (Claude)" : "OpenAI (ChatGPT)"} · <code className="text-xs">{p.model}</code>
                  {p === providers[0] ? <span className="tag ml-1">우선 사용</span> : <span className="tag ml-1">예비</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-red-700">
              {cloud
                ? "인터넷 서버에 AI 키가 없습니다. 노트북에서 review-content-studio 폴더를 열고 검은 창(cmd)에서 `npm run env:push` 를 실행하면 .env.local의 키가 Vercel로 올라갑니다."
                : "키가 없습니다. 프로젝트 폴더의 .env.local 파일에 ANTHROPIC_API_KEY 또는 OPENAI_API_KEY를 넣고 서버를 다시 켜주세요."}
            </p>
          )}
        </div>
        <div className="card p-4 text-sm">
          <h3 className="font-bold">크롬 확장 연동</h3>
          <p className="mt-2 text-[var(--muted)]">
            배달 리뷰 자동답글 도우미 확장의 <b>전송 URL</b>에 아래 주소를 넣으면, 확장에서 수집한 리뷰를 이곳으로 보낼 수 있습니다.
          </p>
          <code className="mt-2 block break-all rounded bg-[#f1efe9] px-2 py-1 text-xs">{ingestUrl}</code>
        </div>
      </div>
    </div>
  );
}
