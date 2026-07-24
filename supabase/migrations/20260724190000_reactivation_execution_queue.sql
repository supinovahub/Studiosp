-- Execucao segura e auditavel das campanhas de reativacao.
alter table public.contacts drop constraint if exists contacts_source_type_check;
alter table public.contacts add constraint contacts_source_type_check
  check (source_type in ('meta_ads','manual','referral','google_ads','reactivation','other'));
alter table public.opportunities drop constraint if exists opportunities_source_type_check;
alter table public.opportunities add constraint opportunities_source_type_check
  check (source_type in ('meta_ads','manual','referral','google_ads','reactivation','other'));

create table public.reactivation_touches (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid not null,
  reactivation_lead_id uuid not null,
  step_number integer not null check (step_number between 1 and 4),
  scheduled_for timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','processing','sent','cancelled','failed')),
  attempt_count integer not null default 0,
  claimed_at timestamptz,
  worker_id text,
  message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(reactivation_lead_id, step_number),
  foreign key(campaign_id,account_id)
    references public.reactivation_campaigns(id,account_id) on delete cascade,
  foreign key(reactivation_lead_id,account_id)
    references public.reactivation_leads(id,account_id) on delete cascade
);
create index reactivation_touches_due_idx
  on public.reactivation_touches(scheduled_for,id) where status='scheduled';

create table public.reactivation_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid not null,
  reactivation_lead_id uuid references public.reactivation_leads(id) on delete set null,
  event_type text not null,
  actor_type text not null check (actor_type in ('user','system','ai','lead')),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key(campaign_id,account_id)
    references public.reactivation_campaigns(id,account_id) on delete cascade
);
create index reactivation_events_campaign_idx
  on public.reactivation_events(campaign_id,created_at desc);

alter table public.reactivation_touches enable row level security;
alter table public.reactivation_events enable row level security;
revoke all on public.reactivation_touches,public.reactivation_events from anon,authenticated;
grant all on public.reactivation_touches,public.reactivation_events to service_role;
grant select on public.reactivation_touches,public.reactivation_events to authenticated;
create policy reactivation_touches_admin on public.reactivation_touches
for select to authenticated using ((select studiosp_private.is_account_admin(account_id)));
create policy reactivation_events_admin on public.reactivation_events
for select to authenticated using ((select studiosp_private.is_account_admin(account_id)));

create or replace function public.studiosp_claim_reactivation_touches(
  p_worker_id text, p_limit integer default 20
) returns setof public.reactivation_touches
language plpgsql security definer set search_path=''
as $$
begin
  return query
  update public.reactivation_touches t set
    status='processing', claimed_at=now(), worker_id=p_worker_id,
    attempt_count=t.attempt_count+1
  where t.id in (
    select q.id from public.reactivation_touches q
    join public.reactivation_campaigns c on c.id=q.campaign_id
    join public.reactivation_leads l on l.id=q.reactivation_lead_id
    where q.status='scheduled' and q.scheduled_for<=now()
      and c.status='active' and l.status in ('queued','contacted')
    order by q.scheduled_for,q.id for update of q skip locked limit p_limit
  ) returning t.*;
end $$;
revoke all on function public.studiosp_claim_reactivation_touches(text,integer) from public,anon,authenticated;
grant execute on function public.studiosp_claim_reactivation_touches(text,integer) to service_role;

