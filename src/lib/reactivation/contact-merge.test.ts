import { describe, expect, it } from 'vitest';
import { contactUpdatesFromImportedLead } from './contact-merge';

describe('contactUpdatesFromImportedLead', () => {
  it('substitui um nome-placeholder igual ao telefone', () => {
    expect(
      contactUpdatesFromImportedLead(
        { name: '5527992854994', email: null },
        {
          name: 'Joao Brito',
          phone_e164: '+5527992854994',
          email: 'joao@example.com',
        }
      )
    ).toEqual({ name: 'Joao Brito', email: 'joao@example.com' });
  });

  it('preserva um nome humano já cadastrado', () => {
    expect(
      contactUpdatesFromImportedLead(
        { name: 'João da Silva', email: 'atual@example.com' },
        {
          name: 'Joao Brito',
          phone_e164: '+5527992854994',
          email: 'novo@example.com',
        }
      )
    ).toEqual({});
  });

  it('preenche nome vazio sem inventar dados ausentes', () => {
    expect(
      contactUpdatesFromImportedLead(
        { name: null, email: null },
        { name: 'Mariana', phone_e164: '+5527997598830' }
      )
    ).toEqual({ name: 'Mariana' });
  });
});
