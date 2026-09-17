export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
export const num = (n: number) => Math.round(n).toLocaleString("ko-KR");
export const pctText = (p: number | null) => (p === null ? "–" : `${p.toFixed(1)}%`);
export const signed = (n: number) => `${n > 0 ? "▲" : n < 0 ? "▼" : ""}${num(Math.abs(n))}`;
export const parseNum = (s: string) => Number(s.replace(/[^\d-]/g, "")) || 0;
