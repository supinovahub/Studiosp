import { describe, expect, it } from 'vitest';
import {
  auditActionLabels,
  auditActorLabels,
  auditEntityLabels,
  labelFor,
} from './labels';

describe('rótulos da auditoria', () => {
  it('traduz ações técnicas para português', () => {
    expect(labelFor(auditActionLabels, 'broker_availability_changed')).toBe(
      'Disponibilidade do corretor alterada'
    );
    expect(labelFor(auditActionLabels, 'proposal_sent')).toBe(
      'Proposta enviada'
    );
  });

  it('traduz entidades e responsáveis', () => {
    expect(labelFor(auditEntityLabels, 'broker_profile')).toBe(
      'Perfil do corretor'
    );
    expect(labelFor(auditEntityLabels, 'opportunity')).toBe('Oportunidade');
    expect(labelFor(auditActorLabels, 'integration')).toBe('Integração');
    expect(labelFor(auditActorLabels, 'user')).toBe('Usuário');
  });
});
