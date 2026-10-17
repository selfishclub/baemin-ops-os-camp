import { storageMode } from "./storage";

// 판(edition) 두 가지.
//  - full(전체판): 사장님 PC. 캠프 뒤에 덧붙인 리뷰·상권·키워드·광고·오케이포스/농협 자동 가져오기까지 전부.
//    (리뷰 수집기 도우미가 같은 컴퓨터에서 돌아야 하는 기능들이다)
//  - basic(기본판): 폰·공유용. 캠프 때 만든 손익장부(손익·오늘·올리기·정산·원가율·규칙)만.
//    나중에 업그레이드한 것은 공유하지 않기로 했다 (사장님 결정 2026-10-17).
// 인터넷 모드(Supabase)면 기본판, 내 PC 모드면 전체판이 기본값. .env 의 NEXT_PUBLIC_EDITION=full|basic 로 바꿀 수 있다.
export type Edition = "full" | "basic";

export function pickEdition(env: string | undefined, mode: "local" | "supabase"): Edition {
  if (env === "full" || env === "basic") return env;
  return mode === "supabase" ? "basic" : "full";
}

export function edition(): Edition {
  return pickEdition(process.env.NEXT_PUBLIC_EDITION, storageMode());
}

export const isBasic = () => edition() === "basic";

/** 기본판에 없는 기능(리뷰·상권·키워드·광고)이 쓰는 설정 키. 내 PC 백업을 인터넷 저장소로 옮길 때 이것들은 빼 둔다 */
export const UPGRADE_SETTING_PREFIXES = ["export_", "keyword_", "ad_", "place_keywords", "review_reply_marks", "market_manual", "cardsales_"];

export const isUpgradeSetting = (key: string) => UPGRADE_SETTING_PREFIXES.some((p) => key.startsWith(p));
