-- Aggregated operational snapshot for the AI reliability panel.

create or replace function public.ai_reply_reliability_snapshot(
  p_account_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not studiosp_private.is_account_admin(p_account_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'window_hours', 24,
    'total', count(*),
    'completed', count(*) filter (where status = 'completed'),
    'retrying', count(*) filter (where status = 'retrying'),
    'handoff', count(*) filter (where status = 'handoff'),
    'failed', count(*) filter (where status = 'failed'),
    'skipped', count(*) filter (where status = 'skipped'),
    'queued', count(*) filter (where status = 'queued'),
    'processing', count(*) filter (where status = 'processing'),
    'overdue', count(*) filter (
      where status in ('queued', 'retrying', 'processing')
        and created_at < now() - interval '3 minutes'
    ),
    'p95_latency_ms', coalesce((
      select percentile_cont(0.95) within group (order by a.latency_ms)
      from public.ai_reply_attempts a
      where a.account_id = p_account_id
        and a.created_at >= now() - interval '24 hours'
        and a.latency_ms is not null
    ), 0)
  )
  into v_result
  from public.ai_reply_jobs
  where account_id = p_account_id
    and created_at >= now() - interval '24 hours';

  return v_result;
end;
$$;

revoke all on function public.ai_reply_reliability_snapshot(uuid)
from public, anon;
grant execute on function public.ai_reply_reliability_snapshot(uuid)
to authenticated, service_role;
