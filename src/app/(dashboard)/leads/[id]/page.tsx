import { LeadDetailPage } from '@/components/studiosp/lead-detail-page';

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LeadDetailPage id={id} />;
}
