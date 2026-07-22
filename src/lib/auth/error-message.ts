/**
 * Supabase Auth returns human-readable messages in English. Keep provider
 * details out of the interface and always present a stable pt-BR message.
 */
export function authErrorMessage(
  error: unknown,
  fallback = 'Não foi possível concluir a solicitação. Tente novamente.'
): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar.';
  }
  if (normalized.includes('user already registered')) {
    return 'Já existe uma conta com este e-mail.';
  }
  if (normalized.includes('password should be at least')) {
    return 'A senha deve ter pelo menos 6 caracteres.';
  }
  if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
  }

  return fallback;
}
