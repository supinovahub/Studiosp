import { requireRole } from '@/lib/auth/account';
import { SimulatorPage } from '@/components/studiosp/simulator-page';

export default async function Page() {
  await requireRole('owner');
  return <SimulatorPage />;
}
