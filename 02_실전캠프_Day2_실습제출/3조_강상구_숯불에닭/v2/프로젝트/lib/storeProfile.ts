import { getStore } from "./storage";

// 가게마다 다른 것만 모아 둔 설정 — 가게 이름과 날씨 지역.
//  코드에 박아 두면 받은 사장님이 남의 가게 이름으로 쓰게 된다. 그래서 설정으로 뺐다.
//  비워 둬도 장부는 전부 돈다. 가게 이름은 보여 주기용이고, 날씨 지역만 없으면 날씨 탭이 쉰다.
export const STORE_PROFILE_KEY = "store_profile";
// 이름을 바꾸면 화면 맨 위도 바로 바뀌게 알린다 (AppShell이 듣는다)
export const STORE_PROFILE_EVENT = "store-profile-changed";

export const APP_NAME = "한눈 손익 장부";

export interface StoreLocation {
  name: string; // "충청북도 청주시"처럼 화면에 보여 줄 이름
  latitude: number;
  longitude: number;
}

export interface StoreProfile {
  name: string; // 가게 이름. 비어 있어도 된다
  location: StoreLocation | null; // 날씨 지역. 없으면 날씨를 받지 않는다
}

export const EMPTY_PROFILE: StoreProfile = { name: "", location: null };

/** 화면 맨 위와 브라우저 탭에 쓸 이름. 가게 이름을 안 넣었으면 앱 이름만 */
export function appTitle(profile: StoreProfile | null | undefined): string {
  const name = profile?.name?.trim();
  return name ? `${name} ${APP_NAME}` : APP_NAME;
}

/** 세무사에게 보낼 엑셀 파일 이름. 파일 이름에 못 쓰는 글자는 뺀다 */
export function taxFileName(profile: StoreProfile | null | undefined, month: string): string {
  const name = (profile?.name ?? "").trim().replace(/[\\/:*?"<>|]/g, "").trim();
  return `${name ? name + "_" : ""}세무사용_${month}.xlsx`;
}

export async function loadStoreProfile(): Promise<StoreProfile> {
  const saved = await getStore().getSetting<StoreProfile>(STORE_PROFILE_KEY);
  return { ...EMPTY_PROFILE, ...(saved ?? {}) };
}

export async function saveStoreProfile(profile: StoreProfile): Promise<void> {
  await getStore().saveSetting(STORE_PROFILE_KEY, profile);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(STORE_PROFILE_EVENT));
}

// ── 날씨 지역 찾기 ────────────────────────────────────────────────
// 사장님이 위도·경도를 알 리 없으니 지역 이름으로 고르게 한다.
//  Open-Meteo 지오코딩(무료·열쇠 없음)을 쓰는데, 그냥 물어보면 쓸 수 없는 답이 온다:
//   - "청주"·"대전"은 아무것도 안 나오고 "청주시"·"대전광역시"여야 나온다
//   - "대전"으로는 전라남도 고흥군의 '대전리' 같은 작은 마을이 시보다 먼저 나온다
//  그래서 ① 접미사를 붙여 여러 번 묻고 ② 한국의 행정 중심지만 남기고 ③ 큰 단위부터 세운다.

export interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country_code?: string;
  feature_code?: string;
  population?: number;
  admin1?: string;
  admin2?: string;
  admin3?: string;
}

/** 행정 단위 순서 — 수도 > 광역시·도청 소재지 > 시·군 > 그 아래 > 그냥 마을 */
const RANK: Record<string, number> = { PPLC: 0, PPLA: 1, PPLA2: 2, PPLA3: 3, PPLA4: 4, PPL: 5 };

/** 무엇으로 물어볼지. "청주"처럼 접미사가 없으면 시·군·구·광역시를 붙여서도 물어본다 */
export function queryVariants(query: string): string[] {
  const q = query.trim();
  if (!q) return [];
  const out = [q];
  if (!/(시|군|구|도)$/.test(q)) out.push(`${q}시`, `${q}군`, `${q}구`);
  out.push(`${q}광역시`, `${q}특별시`, `${q}특별자치시`, `${q}특별자치도`);
  return out;
}

/** 지오코딩 응답 한 줄 → 보여 줄 지역 이름. 큰 단위부터 붙이고 같은 말은 한 번만 */
export function locationLabel(r: GeoResult): string {
  return [r.admin1, r.admin2, r.admin3, r.name]
    .filter((v): v is string => !!v)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(" ");
}

/** 한국의 사람 사는 곳만 남기고, 큰 행정 단위부터 세우고, 같은 좌표는 한 번만 */
export function rankResults(results: GeoResult[], limit = 5): StoreLocation[] {
  const seen = new Set<string>();
  return results
    .filter((r) => r.country_code === "KR" && /^PPL/.test(r.feature_code ?? ""))
    .filter((r) => {
      const key = `${r.latitude},${r.longitude}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (RANK[a.feature_code ?? ""] ?? 9) - (RANK[b.feature_code ?? ""] ?? 9) || (b.population ?? 0) - (a.population ?? 0))
    .slice(0, limit)
    .map((r) => ({ name: locationLabel(r), latitude: r.latitude, longitude: r.longitude }));
}

async function askGeocoder(name: string): Promise<GeoResult[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=ko&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`지역을 찾지 못했어요 (${res.status})`);
  const json = (await res.json()) as { results?: GeoResult[] };
  return json.results ?? [];
}

export async function searchLocations(query: string): Promise<StoreLocation[]> {
  const variants = queryVariants(query);
  if (variants.length === 0) return [];
  const all = (await Promise.all(variants.map((v) => askGeocoder(v).catch(() => [])))).flat();
  return rankResults(all);
}
