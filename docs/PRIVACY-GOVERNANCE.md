# Governança de privacidade e LGPD

Este documento é um controle operacional e não substitui a validação jurídica. Responsável pela revisão: **a definir antes da produção comercial**.

## Cadastro obrigatório do controlador

- Razão social, CNPJ e endereço: **pendente**.
- Canal de atendimento ao titular: **pendente**.
- Encarregado ou canal equivalente: **pendente**.
- Prazo interno de resposta e responsáveis: **pendente**.

## Inventário resumido

| Grupo | Exemplos | Finalidade | Compartilhamento | Retenção proposta |
|---|---|---|---|---|
| Conta | nome, e-mail, telefone, identificador Google, foto | autenticação e suporte | Google e infraestrutura | enquanto ativa + prazo de exclusão |
| Localização | endereço, bairro, cidade, coordenadas | execução e recomendação de serviços | Mapbox e partes após aceite | enquanto necessário ao pedido/obrigação |
| Operação | pedidos, propostas, agendamentos, avaliações | execução da plataforma e defesa de direitos | cliente/profissional envolvidos | definir com jurídico e fiscal |
| Segurança | IP, eventos e auditoria | prevenção de fraude e incidentes | infraestrutura | prazo proporcional; revisar anualmente |

As bases legais de cada finalidade devem ser aprovadas pelo responsável jurídico. Consentimento não deve ser usado como base genérica quando contrato, obrigação legal ou legítimo interesse forem mais adequados.

## Direitos do titular

- Acesso/portabilidade: endpoint autenticado `GET /api/account/export` e botão em **Minha conta**.
- Correção: telas de perfil.
- Preferências: controles desativados por padrão e alteráveis em **Minha conta**.
- Exclusão: prazo de arrependimento de 30 dias; worker executa exclusões vencidas a cada seis horas.
- Revogação/cancelamento: cancelamento disponível durante o prazo.

Pedidos fora desses fluxos devem ser registrados com identidade do solicitante, data, decisão, fundamento e data da resposta.

## Retenção e descarte

O proprietário do sistema deve aprovar uma tabela de retenção antes da produção. Dados necessários por obrigação legal, fiscal, prevenção de fraude ou defesa em processo não devem ser apagados automaticamente sem análise. Quando possível, separar e restringir esses registros antes da anonimização ou exclusão da conta.

## Operadores e contratos

Manter cadastro e contrato/instruções de tratamento para hospedagem da API, banco PostgreSQL, Vercel, Google Identity e Mapbox. Registrar localização do tratamento, subprocessadores, medidas de segurança, prazo de eliminação e mecanismo de transferência internacional quando aplicável.

## Incidentes

1. Conter e preservar evidências sem expor segredos em logs.
2. Identificar dados, titulares, duração, impacto e medidas aplicadas.
3. Avaliar risco ou dano relevante e a necessidade de comunicação à ANPD e aos titulares.
4. Registrar decisão, responsáveis, comunicações e melhorias.
5. Conservar o registro do incidente por pelo menos cinco anos.

## RIPD

Elaborar ou atualizar um Relatório de Impacto antes de tratamentos de alto risco, incluindo geolocalização, recomendação automatizada em escala, novos compartilhamentos ou uso de dados sensíveis. Documentar contexto, necessidade, proporcionalidade, riscos, salvaguardas e aprovação.

## Revisão de versão

As versões atuais gravadas no cadastro estão em `src/shared/privacy/legal-versions.ts`. Toda alteração material deve criar uma nova versão e prever novo aviso/aceite quando a base legal exigir.
