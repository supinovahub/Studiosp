import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  parseReactivationFile,
  type ReactivationRow,
} from '@/lib/reactivation/parse';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    const { accountId, supabase } = await requireRole('admin');
    const { data, error } = await supabase
      .from('reactivation_campaigns')
      .select(
        '*,reactivation_imports(*),reactivation_leads(id,status,objective,entry_value)'
      )
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ campaigns: data ?? [] });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { accountId, userId, supabase } = await requireRole('admin');
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File))
      return NextResponse.json(
        { error: 'Selecione uma planilha.' },
        { status: 400 }
      );
    if (file.size > 10 * 1024 * 1024)
      return NextResponse.json(
        { error: 'O arquivo deve ter no máximo 10 MB.' },
        { status: 400 }
      );
    if (!/\.(csv|xlsx)$/i.test(file.name))
      return NextResponse.json(
        { error: 'Envie um arquivo CSV ou XLSX.' },
        { status: 400 }
      );

    const rows = await parseReactivationFile(file);
    if (rows.length > 5000)
      return NextResponse.json(
        { error: 'O limite é de 5.000 linhas por importação.' },
        { status: 400 }
      );

    const selected = filterByCampaign(rows, form);
    const enriched = await flagExistingContacts(supabase, accountId, selected);
    if (form.get('mode') === 'preview')
      return NextResponse.json({
        rows: enriched.slice(0, 200),
        total: enriched.length,
        sourceTotal: rows.length,
      });

    const valid = enriched.filter((row) => row.phoneE164);
    if (!valid.length)
      return NextResponse.json(
        { error: 'Nenhuma linha do segmento possui um número válido.' },
        { status: 400 }
      );

    const segment = String(form.get('objective') || 'all');
    const { data: campaign, error: campaignError } = await supabase
      .from('reactivation_campaigns')
      .insert({
        account_id: accountId,
        name: String(
          form.get('name') || file.name.replace(/\.(csv|xlsx)$/i, '')
        ),
        objective_segment: ['all', 'live', 'invest', 'unknown'].includes(
          segment
        )
          ? segment
          : 'all',
        entry_value_min: optionalNumber(form.get('entryMin')),
        entry_value_max: optionalNumber(form.get('entryMax')),
        created_by: userId,
      })
      .select()
      .single();
    if (campaignError) throw campaignError;

    const { data: imported, error: importError } = await supabase
      .from('reactivation_imports')
      .insert({
        account_id: accountId,
        campaign_id: campaign.id,
        filename: file.name,
        total_rows: selected.length,
        valid_rows: valid.length,
        invalid_rows: selected.length - valid.length,
        created_by: userId,
      })
      .select()
      .single();
    if (importError) throw importError;

    const { error: leadsError } = await supabase
      .from('reactivation_leads')
      .insert(
        valid.map((row) => ({
          account_id: accountId,
          campaign_id: campaign.id,
          import_id: imported.id,
          row_number: row.rowNumber,
          name: row.name,
          phone_e164: row.phoneE164,
          email: row.email,
          objective: row.objective,
          entry_value: row.entryValue,
          raw_data: row.rawData,
          validation_notes: row.notes,
        }))
      );
    if (leadsError) throw leadsError;
    return NextResponse.json(
      { campaign, imported: valid.length },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

function filterByCampaign(rows: ReactivationRow[], form: FormData) {
  const objective = String(form.get('objective') || 'all');
  const minimum = optionalNumber(form.get('entryMin'));
  const maximum = optionalNumber(form.get('entryMax'));
  return rows.filter((row) => {
    if (objective !== 'all' && row.objective !== objective) return false;
    if (minimum != null && (row.entryValue == null || row.entryValue < minimum))
      return false;
    if (maximum != null && (row.entryValue == null || row.entryValue > maximum))
      return false;
    return true;
  });
}

function optionalNumber(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

async function flagExistingContacts(
  supabase: Awaited<ReturnType<typeof requireRole>>['supabase'],
  accountId: string,
  rows: ReactivationRow[]
) {
  const phones = rows
    .map((row) => row.phoneE164)
    .filter((phone): phone is string => Boolean(phone));
  if (!phones.length) return rows;
  const { data } = await supabase
    .from('contacts')
    .select('phone')
    .eq('account_id', accountId)
    .in('phone', phones.slice(0, 5000));
  const existing = new Set((data ?? []).map((contact) => contact.phone));
  return rows.map((row) =>
    row.phoneE164 && existing.has(row.phoneE164)
      ? {
          ...row,
          notes: [
            ...row.notes,
            'Contato já existe no CRM e será vinculado na ativação.',
          ],
        }
      : row
  );
}
