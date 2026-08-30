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
# Login com Google

Configure `GOOGLE_CLIENT_ID` com o Client ID OAuth 2.0 do tipo **Aplicativo da Web** criado no Google Cloud. Use o mesmo valor configurado no frontend.

No Google Cloud, inclua como origens JavaScript autorizadas:

- `http://localhost:4200`
- a URL pública do frontend em produção

O backend valida o ID token recebido com a biblioteca oficial `google-auth-library`; nenhum segredo OAuth precisa ser enviado ao navegador.
