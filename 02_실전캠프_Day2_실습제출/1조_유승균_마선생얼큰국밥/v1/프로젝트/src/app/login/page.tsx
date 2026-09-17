import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="card p-6">
        <h1 className="text-lg font-bold">리뷰 콘텐츠 스튜디오</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">비밀번호를 입력하면 들어갈 수 있어요.</p>
        <LoginForm next={next && next.startsWith("/") ? next : "/"} />
      </div>
    </div>
  );
}
