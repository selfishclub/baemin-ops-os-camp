"use client";

import { useRef, useState } from "react";
import type { ChatAnswer } from "./chat-engine";
import styles from "./chat.module.css";

type Message = { id: number; role: "me" | "bot"; text: string[]; answer?: ChatAnswer };

const examples = ["카페라떼 핫 액체 얼마야?", "아메리카노 만드는 순서", "마감 순서 알려줘", "손님이 환불해 달라고 하면 뭐라고 해?"];

// onOpenRecipe 가 없는 화면(홈·매뉴얼)에서는 레시피 답변에 ‘레시피 화면으로’ 링크를 보여 준다
export default function ChatPanel({ onOpenRecipe }: { onOpenRecipe?: (recipeId: string, trigger: HTMLElement) => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: "bot", text: ["메뉴 이름이나 매뉴얼 제목의 낱말을 넣어 물어보세요. 레시피북과 매뉴얼에 있는 내용만 답해요."] },
  ]);
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);

  function push(message: Omit<Message, "id">) {
    setMessages((current) => [...current, { ...message, id: nextId.current++ }]);
    window.setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }), 30);
  }

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    push({ role: "me", text: [trimmed] });
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: trimmed }) });
      const body = await response.json();
      if (!response.ok) push({ role: "bot", text: [body.error ?? "답하지 못했어요."] });
      else push({ role: "bot", text: body.answer.text, answer: body.answer });
    } catch {
      push({ role: "bot", text: ["연결이 끊겼어요. 잠시 후 다시 물어봐 주세요."] });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button type="button" className={styles.launcher} onClick={() => setOpen(true)} aria-label="빈숲 OS에 물어보기 열기">물어보기</button>;
  }

  return (
    <section className={styles.panel} aria-label="빈숲 OS에 물어보기">
      <header>
        <div><strong>빈숲 OS에 물어보기</strong><small>레시피북·매뉴얼에 있는 내용만 답해요</small></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="닫기">×</button>
      </header>
      <div className={styles.messages} ref={listRef}>
        {messages.map((message) => (
          <div key={message.id} className={styles.message} data-role={message.role}>
            {message.text.map((line, index) => <p key={index}>{line}</p>)}
            {message.answer?.source === "ai" && <small className={styles.aiNote}>AI가 매뉴얼 내용을 풀어 쓴 답이에요. 정확한 기준은 아래 ‘열기’로 원문을 확인하세요.</small>}
            {message.answer?.suggestions?.length ? (
              <div className={styles.chips}>
                {message.answer.suggestions.map((name) => <button key={name} type="button" onClick={() => void ask(name)}>{name}</button>)}
              </div>
            ) : null}
            {message.answer?.recipeId && (
              <div className={styles.meta}>
                <small>최종 수정 {message.answer.updatedAt}</small>
                {onOpenRecipe
                  ? <button type="button" onClick={(event) => onOpenRecipe(message.answer!.recipeId!, event.currentTarget)}>레시피 열기</button>
                  : <a href="/recipes">레시피 화면으로</a>}
              </div>
            )}
            {message.answer?.href && (
              <div className={styles.meta}>
                <small>최종 수정 {message.answer.updatedAt}</small>
                <a href={message.answer.href}>문서 열기</a>
              </div>
            )}
          </div>
        ))}
        {busy && <div className={styles.message} data-role="bot"><p>찾는 중…</p></div>}
      </div>
      {messages.length <= 1 && (
        <div className={styles.chips}>
          {examples.map((example) => <button key={example} type="button" onClick={() => void ask(example)}>{example}</button>)}
        </div>
      )}
      <form onSubmit={(event) => { event.preventDefault(); void ask(input); }}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // 한글 조합 중 Enter는 글자 확정용이라 보내지 않는다
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void ask(input);
            }
          }}
          placeholder="예: 바닐라라떼 아이스 비율 · 오픈 준비 순서"
          aria-label="질문"
          maxLength={300}
        />
        <button type="submit" disabled={busy || !input.trim()}>보내기</button>
      </form>
    </section>
  );
}
