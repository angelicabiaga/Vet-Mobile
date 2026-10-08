-- PawCruz: Message validation (backend enforcement)
-- Matches the mobile app-level checks in src/api/messageService.js (validateMessage):
--   - A message needs text or an attachment (blank / spaces-only is rejected).
--   - Text is at most 2000 characters.
--   - The sender must be a participant of the conversation.
--   - Attachments are at most 25 MB.
-- A valid message is stored and delivered as before. An invalid one is never
-- stored: the insert fails and the app shows the error as a send failure.
-- Applies to every client (web, mobile, the pawcruz_send_message RPC).
-- Run this in the Supabase SQL Editor. Safe to run more than once.

-- 1) Storage: attachments up to 25 MB (any file type, as before).
update storage.buckets
set file_size_limit = 26214400 -- 25 MB
where id = 'message-attachments';

-- 2) Messages: validate every new message before it is stored.
--    Insert-only, so existing messages are left untouched.
create or replace function public.pawcruz_validate_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.body := nullif(btrim(coalesce(new.body, '')), '');
  new.attachment_url := nullif(btrim(coalesce(new.attachment_url, '')), '');

  if new.body is null and new.attachment_url is null then
    raise exception 'Message not sent: type a message or attach a file.'
      using errcode = '23514';
  end if;

  if new.body is not null and char_length(new.body) > 2000 then
    raise exception 'Message not sent: message is too long (% / 2000 characters).', char_length(new.body)
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id
      and cp.profile_id = new.sender_id
  ) then
    raise exception 'Message not sent: you are not part of this conversation.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists pawcruz_validate_message on public.messages;
create trigger pawcruz_validate_message
  before insert on public.messages
  for each row execute function public.pawcruz_validate_message();
