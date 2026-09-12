# Mercado Pago Marketplace

## Configuração inicial

1. Crie uma aplicação em **Suas integrações** no Mercado Pago.
2. Cadastre exatamente a URL de redirecionamento definida em `MERCADO_PAGO_REDIRECT_URI`.
3. Configure o webhook de pagamentos para `BACKEND_URL/api/payments/mercado-pago/webhook`.
4. Copie a assinatura secreta do webhook para `MERCADO_PAGO_WEBHOOK_SECRET`.
5. Mantenha `MERCADO_PAGO_TEST_MODE=true` e `PAYMENTS_REQUIRED=false` durante a homologação.
6. Execute `npm run prisma:generate` e `npm run prisma:migrate` com o backend parado.

O profissional conecta a própria conta pelo painel. O backend usa OAuth com PKCE e guarda os tokens criptografados. O cliente recebe uma URL do Checkout Pro criada com o token do profissional e com `marketplace_fee` calculada por `PLATFORM_FEE_PERCENT`.

## Produção

Depois de validar OAuth, checkout, retorno e webhook com usuários de teste:

- use credenciais de produção;
- defina `MERCADO_PAGO_TEST_MODE=false`;
- use URLs HTTPS públicas no frontend, backend, callback e webhook;
- defina `PAYMENTS_REQUIRED=true` para impedir o início de serviços não pagos;
- mantenha `ENCRYPTION_MASTER_KEY` estável e protegida.

O status exibido no retorno do navegador não comprova pagamento. Somente o webhook assinado, seguido da consulta do pagamento na API do Mercado Pago, altera um pagamento local para `APPROVED`.
