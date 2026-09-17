import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "../../lib/supabase/env";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  if (!hasSupabaseEnv()) redirect("/");
  const params = await searchParams;
  const next = params.next && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/";
  return <LoginForm next={next} reason={params.reason ?? ""} />;
}
