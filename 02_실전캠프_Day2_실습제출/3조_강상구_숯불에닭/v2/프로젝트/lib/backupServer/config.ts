import path from "node:path";

// 로컬 자동 백업 서버 설정. 환경변수로만 켜진다.
//  - BACKUP_DIR: 백업 폴더 (절대 경로, 프로젝트·git 밖). 없으면 자동 백업 꺼짐.
//  - BACKUP_MAX_MB: 한 파일 최대 크기 (기본 1200MB).
//  - Vercel 등 공개 배포, 시연 모드(Supabase)에서는 무조건 꺼진다.
// 비밀값은 없다. 브라우저에는 "켜짐/꺼짐"과 폴더 이름만 알려 준다.

export interface BackupServerConfig {
  enabled: boolean;
  reason: string | null; // 꺼진 이유 (사장님께 보여 줄 말)
  dir: string; // 절대 경로 (켜졌을 때만 의미 있음)
  maxBytes: number;
}

export function readBackupConfig(env: Record<string, string | undefined> = process.env): BackupServerConfig {
  const maxBytes = Math.max(1, Number(env.BACKUP_MAX_MB) || 1200) * 1024 * 1024;
  const off = (reason: string): BackupServerConfig => ({ enabled: false, reason, dir: "", maxBytes });
  if (env.VERCEL || env.VERCEL_ENV || env.VERCEL_URL) return off("공개 배포(Vercel)에서는 로컬 백업을 쓰지 않아요.");
  if (env.NEXT_PUBLIC_STORAGE === "supabase") return off("시연 모드에서는 로컬 백업을 쓰지 않아요.");
  const dir = (env.BACKUP_DIR ?? "").trim();
  if (!dir) return off("백업 폴더가 정해지지 않았어요. .env.local 에 BACKUP_DIR 을 적어 주세요.");
  if (!path.isAbsolute(dir)) return off("BACKUP_DIR 은 전체 경로(예: C:\\Users\\이름\\Documents\\손익장부백업)여야 해요.");
  return { enabled: true, reason: null, dir: path.normalize(dir), maxBytes };
}
