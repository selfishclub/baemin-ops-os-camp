import { headers } from "next/headers";
import { describeDevice, isOutsideShop, parseIdleMinutes, parseShopIps, pickIp } from "../app/manage/views/view-data";

// 이 요청이 어디서 왔는지 (서버 전용). 열람 기록에 남기고, 매장 밖 접속을 가려낸다.
//
// 환경변수:
//   SHOP_IPS="1.2.3.4"        매장 인터넷 주소(쉼표로 여러 개, 끝이 점이면 앞부분만 비교). 비어 있으면 "밖" 표시를 하지 않는다
//   BLOCK_OUTSIDE_STAFF=1     매장 밖에서 온 직원 접속을 막는다 (사장은 어디서나 됨). 없으면 기록에 "매장 밖"으로 표시만
//   AUTO_LOGOUT_MINUTES=30    한동안 쓰지 않으면 자동 로그아웃 (0 = 끄기)

export type RequestOrigin = { ip: string; device: string; outside: boolean };

export function shopIps() {
  return parseShopIps(process.env.SHOP_IPS);
}

export function blockOutsideStaff() {
  return process.env.BLOCK_OUTSIDE_STAFF === "1";
}

export function idleMinutes() {
  return parseIdleMinutes(process.env.AUTO_LOGOUT_MINUTES);
}

export async function requestOrigin(): Promise<RequestOrigin> {
  try {
    const h = await headers();
    const ip = pickIp(h);
    return { ip, device: describeDevice(h.get("user-agent") ?? ""), outside: isOutsideShop(ip, shopIps()) };
  } catch {
    return { ip: "", device: "", outside: false };
  }
}
