-- Close legacy active sessions whose campaign can no longer send messages.
-- The rows remain available for audit and future reactivation starts a new
-- session instead of being blocked by stale state.

update public.reactivation_sessions s
set
  status = 'cancelled',
  ended_at = coalesce(s.ended_at, now()),
  cooldown_until = null
from public.reactivation_campaigns c
where c.id = s.campaign_id
  and c.account_id = s.account_id
  and s.status = 'active'
  and (
    c.status in ('completed', 'cancelled', 'archived')
    or c.archived_at is not null
  );
