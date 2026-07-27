import { describe, expect, it } from 'vitest';
import { whatsappConnectionKey } from './connection-key';

describe('whatsappConnectionKey', () => {
  it('usa a instância da UAZAPI como identidade da conexão', () => {
    expect(
      whatsappConnectionKey({
        id: 'config-1',
        provider: 'uazapi',
        uazapi_instance_id: 'instance-current',
        phone_number_id: 'ignored',
      })
    ).toBe('uazapi:instance-current');
  });

  it('usa o id da configuração como fallback estável', () => {
    expect(
      whatsappConnectionKey({
        id: 'config-1',
        provider: 'uazapi',
        uazapi_instance_id: null,
      })
    ).toBe('uazapi:config-1');
  });
});
