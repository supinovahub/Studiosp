import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { sendDueReactivationTouches } from '@/lib/reactivation/worker';

export const maxDuration = 60;

export async function POST() {
  try {
    const { accountId } = await requireRole('admin');
    const sent = await sendDueReactivationTouches(supabaseAdmin(), {
      accountId,
      limit: 1,
    });
    return NextResponse.json({ sent });
  } catch (error) {
    return toErrorResponse(error);
  }
}
