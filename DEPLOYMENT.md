# Deploy do backend

## Render

Crie um Blueprint apontando para este repositório. O arquivo `render.yaml` cria
o serviço Docker `project-lar-api`.

Configure no Render:

- `DATABASE_URL`: conexão PostgreSQL do Neon, incluindo `sslmode=require`.
- `FRONTEND_URL`: já definida como `https://project-lar-web.vercel.app`.
- `JWT_SECRET`: gerado automaticamente pelo Blueprint.

O health check está disponível em `/api/health`.

## GitHub Actions

Nenhum secret do Render é necessário no GitHub. O workflow valida o build e a
imagem Docker. O Render acompanha a branch `main` e publica automaticamente cada
push.

## Endereços de produção

- Frontend: `https://project-lar-web.vercel.app`
- API: `https://project-lar-api.onrender.com/api`
- Health check: `https://project-lar-api.onrender.com/api/health`
