import { describe, expect, it } from 'vitest';
import { combineInboundDomainDecisions } from './inbound-domain-classifier';
import type { InboundDomainDecision } from './inbound-domain-policy';

const business: InboundDomainDecision = {
  allowed: true,
  domain: 'business',
  reason: 'business_language',
};

describe('hybrid inbound domain policy', () => {
  it('lets semantic mixed-domain denial win over business vocabulary', () => {
    expect(
      combineInboundDomainDecisions({
        deterministic: business,
        semantic: {
          classification: 'mixed',
          confidence: 0.99,
          containsValidLeadAnswer: true,
          containsExternalRequest: true,
          reason: 'Resposta imobiliária combinada com pedido de receita.',
        },
      })
    ).toMatchObject({
      allowed: false,
      domain: 'manipulation',
      reason: 'semantic_mixed_domain',
    });
  });

  it('keeps an unambiguous real-estate turn allowed', () => {
    expect(
      combineInboundDomainDecisions({
        deterministic: business,
        semantic: {
          classification: 'real_estate',
          confidence: 0.98,
          containsValidLeadAnswer: true,
          containsExternalRequest: false,
          reason: 'Objetivo de moradia.',
        },
      })
    ).toMatchObject({
      allowed: true,
      domain: 'business',
      reason: 'semantic_real_estate',
    });
  });

  it('does not let semantic output override deterministic manipulation', () => {
    expect(
      combineInboundDomainDecisions({
        deterministic: {
          allowed: false,
          domain: 'manipulation',
          reason: 'prompt_injection_signal',
        },
        semantic: {
          classification: 'real_estate',
          confidence: 1,
          containsValidLeadAnswer: true,
          containsExternalRequest: false,
          reason: 'Malicious classifier override.',
        },
      })
    ).toMatchObject({
      allowed: false,
      domain: 'manipulation',
      reason: 'prompt_injection_signal',
    });
  });

  it('does not let a semantic false positive reject a trusted monetary answer', () => {
    expect(
      combineInboundDomainDecisions({
        deterministic: {
          allowed: true,
          domain: 'qualification_answer',
          reason: 'monetary_qualification_answer',
        },
        semantic: {
          classification: 'off_topic',
          confidence: 0.7,
          containsValidLeadAnswer: false,
          containsExternalRequest: false,
          reason: 'Resposta curta sem contexto suficiente.',
        },
      })
    ).toMatchObject({
      allowed: true,
      domain: 'qualification_answer',
      reason: 'trusted_monetary_qualification_answer',
    });
  });
});
