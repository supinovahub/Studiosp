import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

export const runtime = 'nodejs';

type Row = Record<string, unknown>;

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as {
      batchId?: unknown;
    } | null;
    const batchId = String(body?.batchId ?? '');
    if (!batchId) {
      return NextResponse.json(
        { error: 'Lote não informado.' },
        { status: 400 }
      );
    }

    const { data: batch, error: batchError } = await ctx.supabase
      .from('document_analysis_batches')
      .select('id, status')
      .eq('account_id', ctx.accountId)
      .eq('id', batchId)
      .maybeSingle();
    if (batchError) throw batchError;
    if (!batch) {
      return NextResponse.json(
        { error: 'Lote não encontrado.' },
        { status: 404 }
      );
    }
    if (batch.status !== 'ready') {
      return NextResponse.json(
        { error: 'Aguarde o preview ficar pronto antes de aprovar.' },
        { status: 409 }
      );
    }

    const [{ data: profile }, { data: items, error: itemsError }] =
      await Promise.all([
        ctx.supabase
          .from('profiles')
          .select('id')
          .eq('account_id', ctx.accountId)
          .eq('user_id', ctx.userId)
          .maybeSingle(),
        ctx.supabase
          .from('document_analysis_items')
          .select('*, fields:document_analysis_fields(*)')
          .eq('account_id', ctx.accountId)
          .eq('batch_id', batchId)
          .order('sort_order'),
      ]);
    if (itemsError) throw itemsError;

    const pending = (items ?? []).filter((item) => item.decision === 'pending');
    if (!pending.length) {
      return NextResponse.json({
        approved: 0,
        message: 'Este preview já foi processado.',
      });
    }

    const targetByItem = new Map<string, string>();
    let approved = 0;
    let ignored = 0;

    for (const item of pending.filter(
      (entry) => entry.item_type === 'development'
    )) {
      if (item.proposed_action === 'ignore') {
        await decideItem(ctx.supabase, ctx.accountId, item.id, 'rejected');
        ignored++;
        continue;
      }
      const fields = fieldMap(item.fields);
      const name = stringValue(fields.name) || String(item.display_name).trim();
      if (!name) continue;

      const developerName =
        stringValue(fields.developer_name) || 'Incorporadora não informada';
      const city =
        stringValue(fields.city) ||
        addressPart(fields.address, 'city') ||
        'São Paulo';
      const neighborhoodName =
        stringValue(fields.neighborhood) ||
        addressPart(fields.address, 'neighborhood') ||
        'Bairro não informado';
      const stateCode = (addressPart(fields.address, 'state') || 'SP')
        .slice(0, 2)
        .toUpperCase();

      const developerId = await ensureDeveloper(
        ctx.supabase,
        ctx.accountId,
        profile?.id ?? null,
        developerName
      );
      const neighborhoodId = await ensureNeighborhood(
        ctx.supabase,
        ctx.accountId,
        profile?.id ?? null,
        neighborhoodName,
        city,
        /^[A-Z]{2}$/.test(stateCode) ? stateCode : 'SP'
      );
      const normalized = normalizeName(name);
      const { data: existing, error: existingError } = await ctx.supabase
        .from('developments')
        .select('id')
        .eq('account_id', ctx.accountId)
        .eq('developer_id', developerId)
        .eq('normalized_name', normalized)
        .neq('status', 'archived')
        .maybeSingle();
      if (existingError) throw existingError;
      if (item.proposed_action === 'deactivate') {
        if (!existing) {
          await decideItem(ctx.supabase, ctx.accountId, item.id, 'rejected');
          ignored++;
          continue;
        }
        const { error } = await ctx.supabase
          .from('developments')
          .update({ status: 'paused', updated_by: profile?.id ?? null })
          .eq('account_id', ctx.accountId)
          .eq('id', existing.id);
        if (error) throw error;
        await decideItem(
          ctx.supabase,
          ctx.accountId,
          item.id,
          'approved',
          existing.id
        );
        approved++;
        continue;
      }

      const values = {
        account_id: ctx.accountId,
        developer_id: developerId,
        neighborhood_id: neighborhoodId,
        name,
        normalized_name: normalized,
        description:
          stringValue(fields.knowledge_notes) ||
          stringValue(fields.highlights) ||
          name,
        address: addressValue(fields.address, city, stateCode),
        property_timing: timingValue(fields.property_timing),
        expected_delivery_date: dateValue(fields.expected_delivery_date),
        highlights: stringArray(fields.highlights),
        knowledge_notes: stringValue(fields.knowledge_notes) || null,
        updated_by: profile?.id ?? null,
      };

      const result = existing
        ? await ctx.supabase
            .from('developments')
            .update(values)
            .eq('account_id', ctx.accountId)
            .eq('id', existing.id)
            .select('id')
            .single()
        : await ctx.supabase
            .from('developments')
            .insert({
              ...values,
              created_by: profile?.id ?? null,
              status: 'draft',
            })
            .select('id')
            .single();
      if (result.error || !result.data) {
        throw result.error ?? new Error('Empreendimento não cadastrado.');
      }
      targetByItem.set(item.id, result.data.id);
      await decideItem(
        ctx.supabase,
        ctx.accountId,
        item.id,
        'approved',
        result.data.id
      );
      approved++;
    }

    for (const item of pending.filter((entry) => entry.item_type === 'offer')) {
      if (item.proposed_action === 'ignore') {
        await decideItem(ctx.supabase, ctx.accountId, item.id, 'rejected');
        ignored++;
        continue;
      }
      const developmentId =
        targetByItem.get(String(item.parent_item_id)) ||
        (await targetFromItem(
          ctx.supabase,
          ctx.accountId,
          String(item.parent_item_id ?? '')
        ));
      const fields = fieldMap(item.fields);
      const areaMin = positiveNumber(fields.area_min_sqm);
      if (!developmentId || areaMin == null) {
        await decideItem(ctx.supabase, ctx.accountId, item.id, 'rejected');
        ignored++;
        continue;
      }
      const label = stringValue(fields.label) || String(item.display_name);
      const values = {
        account_id: ctx.accountId,
        development_id: developmentId,
        label,
        area_min_sqm: areaMin,
        area_max_sqm: positiveNumber(fields.area_max_sqm),
        price_from: nonNegativeNumber(fields.price_from),
        entry_from: nonNegativeNumber(fields.entry_from),
        installment_from: nonNegativeNumber(fields.installment_from),
        terms_summary: stringValue(fields.terms_summary) || null,
        property_timing: timingValue(fields.property_timing),
        valid_until: dateValue(fields.valid_until),
        is_active: fields.is_active !== false,
        created_by: profile?.id ?? null,
      };
      const { data: existing } = await ctx.supabase
        .from('development_offers')
        .select('id')
        .eq('account_id', ctx.accountId)
        .eq('development_id', developmentId)
        .ilike('label', label)
        .maybeSingle();
      if (item.proposed_action === 'deactivate') {
        if (!existing) {
          await decideItem(ctx.supabase, ctx.accountId, item.id, 'rejected');
          ignored++;
          continue;
        }
        const { error } = await ctx.supabase
          .from('development_offers')
          .update({ is_active: false })
          .eq('account_id', ctx.accountId)
          .eq('id', existing.id);
        if (error) throw error;
        await decideItem(
          ctx.supabase,
          ctx.accountId,
          item.id,
          'approved',
          existing.id
        );
        approved++;
        continue;
      }
      const result = existing
        ? await ctx.supabase
            .from('development_offers')
            .update(values)
            .eq('id', existing.id)
            .eq('account_id', ctx.accountId)
            .select('id')
            .single()
        : await ctx.supabase
            .from('development_offers')
            .insert(values)
            .select('id')
            .single();
      if (result.error || !result.data) {
        throw result.error ?? new Error('Condição comercial não cadastrada.');
      }
      await decideItem(
        ctx.supabase,
        ctx.accountId,
        item.id,
        'approved',
        result.data.id
      );
      approved++;
    }

    await ctx.supabase.from('document_analysis_events').insert({
      account_id: ctx.accountId,
      batch_id: batchId,
      actor_type: 'user',
      actor_id: profile?.id ?? null,
      event_type: 'preview_approved',
      metadata: { approved, ignored },
    });

    return NextResponse.json({
      approved,
      ignored,
      message: `${approved} item(ns) cadastrado(s) como rascunho.`,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function fieldMap(fields: Row[]) {
  return Object.fromEntries(
    (fields ?? [])
      .filter((field) => field.decision !== 'rejected')
      .map((field) => [
        String(field.field_name),
        field.edited_value ?? field.proposed_value,
      ])
  );
}

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function ensureDeveloper(
  db: Awaited<ReturnType<typeof requireRole>>['supabase'],
  accountId: string,
  profileId: string | null,
  name: string
) {
  const normalized = normalizeName(name);
  const { data: existing, error } = await db
    .from('developers')
    .select('id')
    .eq('account_id', accountId)
    .eq('normalized_name', normalized)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing.id;
  const result = await db
    .from('developers')
    .insert({
      account_id: accountId,
      name,
      normalized_name: normalized,
      created_by: profileId,
    })
    .select('id')
    .single();
  if (result.error || !result.data) throw result.error;
  return result.data.id;
}

async function ensureNeighborhood(
  db: Awaited<ReturnType<typeof requireRole>>['supabase'],
  accountId: string,
  profileId: string | null,
  name: string,
  city: string,
  stateCode: string
) {
  const normalized = normalizeName(name);
  const { data: existing, error } = await db
    .from('neighborhoods')
    .select('id')
    .eq('account_id', accountId)
    .eq('normalized_name', normalized)
    .eq('city', city)
    .eq('state_code', stateCode)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing.id;
  const result = await db
    .from('neighborhoods')
    .insert({
      account_id: accountId,
      name,
      normalized_name: normalized,
      city,
      state_code: stateCode,
      created_by: profileId,
    })
    .select('id')
    .single();
  if (result.error || !result.data) throw result.error;
  return result.data.id;
}

async function decideItem(
  db: Awaited<ReturnType<typeof requireRole>>['supabase'],
  accountId: string,
  itemId: string,
  decision: 'approved' | 'rejected',
  targetId?: string
) {
  const { error } = await db
    .from('document_analysis_items')
    .update({ decision, target_id: targetId ?? null })
    .eq('account_id', accountId)
    .eq('id', itemId);
  if (error) throw error;
}

async function targetFromItem(
  db: Awaited<ReturnType<typeof requireRole>>['supabase'],
  accountId: string,
  itemId: string
) {
  if (!itemId) return null;
  const { data } = await db
    .from('document_analysis_items')
    .select('target_id')
    .eq('account_id', accountId)
    .eq('id', itemId)
    .maybeSingle();
  return data?.target_id ?? null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  const text = stringValue(value);
  return text
    ? text
        .split(/[,;\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function nonNegativeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function dateValue(value: unknown) {
  const text = stringValue(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function timingValue(value: unknown) {
  const text = normalizeName(stringValue(value));
  if (['ready', 'pronto', 'entregue'].includes(text)) return 'ready';
  if (['both', 'ambos', 'na planta e pronto'].includes(text)) return 'both';
  return 'off_plan';
}

function addressPart(value: unknown, key: string) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? stringValue((value as Row)[key])
    : '';
}

function addressValue(
  value: unknown,
  city: string,
  state: string
): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Row), city, state };
  }
  return { street: stringValue(value) || null, city, state };
}
