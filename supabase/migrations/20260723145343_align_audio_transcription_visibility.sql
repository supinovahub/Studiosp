drop policy if exists audio_transcriptions_read
  on public.audio_transcriptions;

create policy audio_transcriptions_read
on public.audio_transcriptions
for select
to authenticated
using (
  exists (
    select 1
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = audio_transcriptions.message_id
      and c.account_id = audio_transcriptions.account_id
      and public.is_account_member(c.account_id)
  )
);
