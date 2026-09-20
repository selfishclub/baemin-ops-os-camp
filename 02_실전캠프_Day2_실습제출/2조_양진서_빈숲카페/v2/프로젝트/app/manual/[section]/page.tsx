import { notFound } from "next/navigation";
import { requireActiveViewer } from "../../auth";
import { checkSectionAccess } from "../../../db/portal-store";
import LockedNotice from "../../locked-notice";
import { portalSections } from "../../portal-sections";
import { previewViewer, readPreviewRole } from "../../preview/preview-role";
import { isManualSection } from "../manual-data";
import ManualSection from "./manual-section";

export const dynamic = "force-dynamic";

// 운영 매뉴얼 한 영역 (오픈·미들·마감 …). 로그인·재직·영역 잠금을 서버에서 확인한다.
export default async function ManualSectionRoute({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const info = portalSections.find((item) => item.id === section);
  if (!isManualSection(section) || !info) notFound();
  const session = await requireActiveViewer(`/manual/${section}`);
  const access = await checkSectionAccess(session, section);
  if (!access.allowed) return <LockedNotice title={info.title} />;
  // 미리보기(로그인 꺼짐)에서는 가짜 사람(미리보기 사장 / 직원 A)으로 본다
  const person = session.mode === "demo" ? previewViewer(await readPreviewRole()) : session.viewer!;
  return (
    <ManualSection
      sectionId={section}
      title={info.title}
      description={info.description}
      role={person.role}
      demo={session.mode === "demo"}
      lockedForStaff={access.locked}
    />
  );
}
