export const stageLabels: Record<string, string> = {
  received: 'Recebido',
  contacting: 'Em contato',
  qualifying: 'Em qualificação',
  qualified: 'Qualificado',
  awaiting_schedule: 'Aguardando agendamento',
  meeting_scheduled: 'Reunião agendada',
  meeting_completed: 'Reunião realizada',
  proposal_sent: 'Proposta enviada',
  negotiating: 'Em negociação',
  contract_pending: 'Contrato pendente',
  won: 'Venda realizada',
  lost: 'Perdido',
};

export const attentionLabels: Record<string, string> = {
  no_action: 'Sem pendência',
  awaiting_lead: 'Aguardando o lead',
  followup_scheduled: 'Follow-up agendado',
  followup_due: 'Follow-up pendente',
  awaiting_broker: 'Aguardando corretor',
  broker_sla_expired: 'Prazo do corretor vencido',
  owner_attention: 'Atenção do dono',
  human_takeover: 'Atendimento humano',
  ai_processing: 'IA processando',
  integration_error: 'Erro de integração',
};

export const qualificationLabels: Record<string, string> = {
  not_started: 'Não iniciada',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  needs_review: 'Precisa de revisão',
};

export const meetingLabels: Record<string, string> = {
  not_started: 'Não iniciada',
  collecting_preference: 'Coletando preferência',
  slot_proposed: 'Horário proposto',
  reserved: 'Pré-agendada',
  confirmed: 'Confirmada',
  completed: 'Realizada',
  no_show: 'Não compareceu',
  cancelled: 'Cancelada',
  reschedule_requested: 'Reagendamento solicitado',
};

export const commercialLabels: Record<string, string> = {
  no_proposal: 'Sem proposta',
  proposal_sent: 'Proposta enviada',
  negotiating: 'Em negociação',
  contract_sent: 'Contrato enviado',
  awaiting_signature: 'Aguardando assinatura',
  signed: 'Assinado',
  won: 'Venda realizada',
  lost: 'Perdido',
};

export const sourceLabels: Record<string, string> = {
  meta_ads: 'Meta Ads',
  manual: 'Importação manual',
  referral: 'Indicação',
  google_ads: 'Google Ads',
  other: 'Outra origem',
};

export const eventLabels: Record<string, string> = {
  lead_received: 'Lead recebido',
  contact_attempted: 'Contato iniciado',
  qualification_started: 'Qualificação iniciada',
  qualification_completed: 'Qualificação concluída',
  schedule_preference_recorded: 'Preferência de horário registrada',
  appointment_reserved: 'Reunião pré-agendada',
  appointment_confirmed: 'Reunião confirmada',
  meeting_completed: 'Reunião realizada',
  meeting_no_show: 'Ausência registrada',
  proposal_sent: 'Proposta enviada',
  negotiation_started: 'Negociação iniciada',
  contract_sent: 'Contrato enviado',
  contract_signed: 'Contrato assinado',
  sale_confirmed: 'Venda confirmada',
  lead_lost: 'Lead marcado como perdido',
  ai_handoff: 'Transferido para atendimento humano',
  integration_failed: 'Falha de integração',
  owner_override: 'Exceção aplicada pelo dono',
  opportunity_reopened: 'Oportunidade reaberta',
};

export const auditActionLabels: Record<string, string> = {
  ...eventLabels,
  attention_resolved: 'Pendência resolvida',
  broker_availability_changed: 'Disponibilidade do corretor alterada',
  development_published: 'Empreendimento publicado',
};

export const auditEntityLabels: Record<string, string> = {
  attention_item: 'Pendência',
  broker_profile: 'Perfil do corretor',
  development: 'Empreendimento',
  opportunity: 'Oportunidade',
};

export const auditActorLabels: Record<string, string> = {
  ai: 'IA',
  integration: 'Integração',
  system: 'Sistema',
  user: 'Usuário',
};

export const stageOrder = Object.keys(stageLabels);

export function labelFor(map: Record<string, string>, value?: string | null) {
  if (!value) return 'Não informado';
  return map[value] ?? value.replaceAll('_', ' ');
}

export function formatDateTime(value?: string | null) {
  if (!value) return 'Não informado';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

export function formatCurrencyBRL(value?: number | string | null) {
  if (value === null || value === undefined || value === '')
    return 'Não informado';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(Number(value));
}
