# Deploy do backend

## Render

Crie um Blueprint apontando para este repositório. O arquivo `render.yaml` cria o serviço Docker `project-lar-api`.

Configure no Render:

- `DATABASE_URL`: conexão PostgreSQL do Neon.
- `FRONTEND_URL`: URL final da Vercel, sem barra no final.
- `JWT_SECRET`: gerado automaticamente pelo Blueprint.

O health check está disponível em `/api/health`.

## GitHub Actions

Adicione no repositório o secret:

- `RENDER_DEPLOY_HOOK_URL`: Deploy Hook criado no painel do serviço Render.

Pull requests executam build e validação da imagem. Pushes na `main` validam e disparam o deploy.
