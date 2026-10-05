"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./views.module.css";
import { apiFetch } from "../../preview/preview-api";
import PreviewBanner from "../../preview/preview-banner";
import { todayInSeoul } from "../../checks/check-data";
import { describeRow, groupByDate, summarizeByPerson, seoulTime, viewKindLabels, type ViewRow } from "./view-data";

type Staff = { id: string; login_id: string; display_name: string; role: string; active: boolean };
type Settings = { shopIps: string[]; blockOutsideStaff: boolean; idleMinutes: number; myIp: string; myDevice: string; myOutside: boolean };

const dayOptions = [7, 14, 30, 90];

function formatDate(date: string) {
  const [, month, day] = date.split("-");
  const weekday = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "short" }).format(new Date(`${date}T12:00:00+09:00`));
  return `${Number(month)}월 ${Number(day)}일 (${weekday})`;
}

function formatLast(iso: string) {
  if (!iso) return "기록 없음";
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()} ${seoulTime(iso)}`;
}

export default function ViewBoard({ preview = false }: { preview?: boolean }) {
  const [rows, setRows] = useState<ViewRow[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [days, setDays] = useState(14);
  const [person, setPerson] = useState("");
  const [message, setMessage] = useState("열람 기록을 불러오는 중입니다.");

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      const response = await apiFetch(preview, `/api/admin/views?days=${days}${person ? `&user=${encodeURIComponent(person)}` : ""}`, { cache: "no-store" });
      const body = await response.json();
      if (cancelled) return;
      if (!response.ok) {
        setMessage(body.error ?? "열람 기록을 불러오지 못했습니다.");
        return;
      }
      setRows(body.rows ?? []);
      setStaff(body.staff ?? []);
      setSettings(body.settings ?? null);
      setMessage("");
    });
    return () => {
      cancelled = true;
    };
  }, [preview, days, person]);

  const today = todayInSeoul();
  const summary = useMemo(() => summarizeByPerson(rows, today, person ? staff.filter((item) => item.id === person) : staff), [rows, staff, today, person]);
  const groups = useMemo(() => groupByDate(rows), [rows]);
  const outsideRows = rows.filter((row) => row.outside).length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/">← 빈숲 OS</Link>
        <h1>열람 기록</h1>
        <p>누가 언제 어떤 레시피·매뉴얼·사진을 열었고 챗봇에 무엇을 물었는지, 어느 기기·어디서 들어왔는지 남습니다. 직원은 이 화면을 볼 수 없고, 기록은 아무도 지우지 못합니다.</p>
      </header>

      {preview && <PreviewBanner what="열람 기록 (가짜 기록 · 이 브라우저에서 연 것만 더해짐)" role="owner" />}
      {message && <p className={styles.message} role="status">{message}</p>}

      {settings && (
        <section className={styles.settings} aria-label="지금 설정">
          <div>
            <strong>자동 로그아웃</strong>
            <span>{settings.idleMinutes > 0 ? `${settings.idleMinutes}분 동안 쓰지 않으면 로그아웃` : "꺼짐"}</span>
          </div>
          <div>
            <strong>매장 인터넷 주소</strong>
            <span>
              {settings.shopIps.length
                ? `${settings.shopIps.join(", ")} · 다른 곳에서 온 접속은 "매장 밖"으로 표시${settings.blockOutsideStaff ? "하고 직원은 막음" : " (막지는 않음)"}`
                : "아직 등록 안 됨 — 등록하면 매장 밖 접속을 표시·차단할 수 있어요"}
            </span>
          </div>
          <div>
            <strong>지금 이 화면을 보는 곳</strong>
            <span>
              {settings.myIp || "주소를 알 수 없음"} · {settings.myDevice}
              {settings.shopIps.length ? (settings.myOutside ? " · 매장 밖" : " · 매장") : " — 매장에서 이 화면을 열었다면 이 주소가 매장 인터넷 주소예요"}
            </span>
          </div>
        </section>
      )}

      <section className={styles.controls} aria-label="기간과 사람">
        <label>
          기간
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            {dayOptions.map((option) => <option key={option} value={option}>최근 {option}일</option>)}
          </select>
        </label>
        <label>
          사람
          <select value={person} onChange={(event) => setPerson(event.target.value)}>
            <option value="">모두</option>
            {staff.map((item) => <option key={item.id} value={item.id}>{item.display_name || item.login_id}{item.active ? "" : " (중지)"}</option>)}
          </select>
        </label>
        <p className={styles.total}>{rows.length}건{outsideRows ? ` · 매장 밖 ${outsideRows}건` : ""}</p>
      </section>

      <section className={styles.people} aria-label="사람별 요약">
        {summary.map((item) => (
          <button key={item.id} type="button" className={styles.person} data-selected={person === item.id} data-outside={item.outsideCount > 0} onClick={() => setPerson(person === item.id ? "" : item.id)}>
            <strong>{item.name}</strong>
            <span>마지막: {formatLast(item.lastAt)}{item.lastKind ? ` · ${viewKindLabels[item.lastKind]}` : ""}</span>
            <span>오늘 {item.todayCount}건 · 기간 {item.periodCount}건{item.outsideCount ? ` · 매장 밖 ${item.outsideCount}건` : ""}{item.blockedCount ? ` · 차단 ${item.blockedCount}건` : ""}</span>
            {item.lastDevice && <small>{item.lastDevice}</small>}
          </button>
        ))}
      </section>

      {!message && !rows.length && <p className={styles.empty}>이 기간에는 기록이 없어요. 직원이 레시피나 매뉴얼을 열면 여기에 쌓입니다.</p>}

      {groups.map((group) => (
        <section key={group.date} className={styles.day} aria-labelledby={`day-${group.date}`}>
          <h2 id={`day-${group.date}`}>{formatDate(group.date)}{group.date === today ? " · 오늘" : ""}</h2>
          <ol>
            {group.rows.map((row) => (
              <li key={row.id} data-kind={row.kind} data-outside={row.outside}>
                <time dateTime={row.viewed_at}>{seoulTime(row.viewed_at)}</time>
                <b>{row.user_name || "(이름 없음)"}</b>
                <span>{describeRow(row)}</span>
                <small>{row.device}{row.ip ? ` · ${row.ip}` : ""}{row.outside ? " · 매장 밖" : ""}</small>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}
