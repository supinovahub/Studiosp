# Agente SDR e catálogo de imóveis

## Migração

Aplique `supabase/migrations/20260722150000_sdr_products.sql` ao projeto Supabase.

Ela cria:

- `products`: catálogo account-scoped de empreendimentos/unidades;
- `product_media`: fotos, vídeos, plantas e documentos;
- `conversation_sdr_state`: classificação consolidada atual de cada lead;
- `ai_sdr_events`: trilha de auditoria das classificações e respostas.

Todas as tabelas têm RLS. Membros podem consultar; somente admin/owner pode alterar o catálogo. O estado SDR é atualizado pelo agente e pode ser lido pelos membros da conta.

## Cadastro de imóvel

`POST /api/products` exige sessão de admin/owner.

```json
{
  "sku": "ST-JARDINS-101",
  "name": "Studio Jardins 101",
  "development_name": "Viva Jardins",
  "property_type": "studio",
  "availability_status": "available",
  "description": "Studio pronto para morar, próximo ao metrô.",
  "neighborhood": "Jardins",
  "city": "São Paulo",
  "state": "SP",
  "price": 520000,
  "area_m2": 28,
  "bedrooms": 1,
  "bathrooms": 1,
  "parking_spaces": 0,
  "features": ["academia", "coworking", "próximo ao metrô"],
  "payment_terms": "Entrada a partir de 20%; saldo sob consulta.",
  "media": [
    {
      "media_type": "image",
      "url": "https://cdn.example.com/studio-101.jpg",
      "caption": "Living do Studio Jardins 101",
      "is_cover": true
    }
  ]
}
```

URLs de mídia precisam ser HTTPS e publicamente acessíveis pelo provedor do WhatsApp.

## Endpoints

- `GET/POST /api/products`
- `GET/PATCH/DELETE /api/products/{id}`
- `POST /api/products/{id}/media`
- `DELETE /api/products/{id}/media/{mediaId}`
- `GET /api/ai/sdr/{conversationId}`: estado atual da qualificação.

## Pipeline do agente

1. Recebe o histórico recente da conversa.
2. Classifica intenção, estágio, temperatura, score e preferências.
3. Consulta somente imóveis ativos e disponíveis da conta.
4. Ordena os candidatos por localização, orçamento, tipo, quartos, área e vaga.
5. Gera uma resposta usando os registros retornados como fonte de verdade.
6. Persiste a classificação e os produtos recomendados.
7. Se o cliente pediu fotos, envia até três imagens cadastradas, uma por imóvel.
8. Reclamação ou pedido de humano força handoff e pausa da autorresposta.

O agente nunca deve afirmar preço ou disponibilidade de um imóvel que não esteja no resultado atual da consulta.

## Configuração necessária

- Configuração de IA ativa em Configurações → Agentes;
- chave OpenAI ou Anthropic salva pelo fluxo existente;
- autorresposta habilitada para operação automática;
- WhatsApp Meta ou UAZAPI conectado;
- produtos ativos com `availability_status = available`;
- fotos em URLs HTTPS públicas para envio automático.
