-- Reativação pode voltar a incluir um contato após o encerramento da sessão.
-- A exclusividade continua existindo apenas enquanto uma sessão está ativa.
update public.reactivation_sessions
set cooldown_until = null
where cooldown_until is not null;
