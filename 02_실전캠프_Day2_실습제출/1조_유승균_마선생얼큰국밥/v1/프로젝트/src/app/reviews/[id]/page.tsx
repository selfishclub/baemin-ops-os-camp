import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentStudio } from "@/components/ContentStudio";
import { hasAnyProvider } from "@/lib/ai/client";
import { getReview, listContents } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const review = await getReview(id);
  if (!review) notFound();
  const contents = await listContents(id);
  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="text-sm text-[var(--muted)] hover:underline">← 리뷰 목록</Link>
      <ContentStudio review={review} initialContents={contents} aiReady={hasAnyProvider()} />
    </div>
  );
}
