"use client";

import { createBrowserClient } from "@supabase/ssr";
import { hasSupabaseEnv, supabaseAnonKey, supabaseUrl } from "./env";

// 브라우저(로그인 화면)에서 쓰는 클라이언트
export function createSupabaseBrowserClient() {
  if (!hasSupabaseEnv()) return null;
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
