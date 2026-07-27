alter table public.reactivation_campaigns
  drop constraint if exists reactivation_campaigns_status_check;

alter table public.reactivation_campaigns
  add constraint reactivation_campaigns_status_check
  check (
    status in (
      'draft',
      'ready',
      'active',
      'paused',
      'completed',
      'cancelled',
      'archived'
    )
  );

alter table public.reactivation_campaigns
  add column if not exists archived_at timestamptz;

comment on column public.reactivation_campaigns.archived_at is
  'Data em que a campanha foi retirada da lista operacional sem apagar seu histórico.';
