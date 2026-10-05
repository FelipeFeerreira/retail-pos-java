# Deploy online — Empório POS Beta

Este guia explica como publicar uma versão beta do sistema usando:

- **Vercel** → frontend (React)
- **Render / Railway / Fly.io** → backend Java (Spring Boot)
- **Neon** → banco PostgreSQL

> O backend Java **não roda no Vercel** (a Vercel só executa Node, Python, Go e Ruby serverless). Por isso o backend precisa de um serviço separado.

---

## 1. Banco de dados — Neon

1. Acesse https://neon.tech e crie uma conta (pode usar login com GitHub).
2. Crie um novo projeto. Escolha a região mais próxima dos seus usuários (ex.: `us-east-1`).
3. No dashboard do projeto, copie a **Connection string** do tipo **JDBC** ou a URL padrão:
   ```
   postgresql://<user>:<password>@<host>/<database>?sslmode=require
   ```
4. Guarde essa string — ela será usada como `SPRING_DATASOURCE_URL` no backend.

---

## 2. Backend — Render (recomendado, free tier)

1. Acesse https://render.com e faça login com GitHub.
2. No dashboard, clique em **New → Web Service**.
3. Conecte o repositório `FelipeFeerreira/retail-pos-java`.
4. Configure:
   - **Name:** `emporio-pos-api`
   - **Root Directory:** `backend`
   - **Runtime:** `Docker`
   - **Branch:** `main`
   - **Instance Type:** `Free`
5. Em **Environment Variables**, adicione:

   | Variável | Valor |
   |---|---|
   | `SPRING_DATASOURCE_URL` | URL do Neon (copiada no passo 1) |
   | `SPRING_DATASOURCE_USERNAME` | usuário do Neon |
   | `SPRING_DATASOURCE_PASSWORD` | senha do Neon |
   | `JWT_SECRET` | string aleatória de pelo menos 32 bytes |
   | `ADMIN_PASSWORD` | senha do usuário demo (ex: `demo1234`) |
   | `APP_ORIGIN` | URL do frontend Vercel + localhost se quiser testar local |
   | `REQUIRE_HTTPS` | `true` |
   | `SPRING_PROFILES_ACTIVE` | `demo` *(ativa o seed de dados)* |

   Exemplo de `APP_ORIGIN` com múltiplas origens:
   ```
   https://emporio-pos.vercel.app,https://emporio-pos-git-main-felipefeerreira.vercel.app,http://localhost:3000
   ```
6. Clique em **Create Web Service**.
7. Aguarde o build e o deploy. Anote a URL pública (ex.: `https://emporio-pos-api.onrender.com`).

---

## 3. Frontend — Vercel

1. Acesse https://vercel.com e faça login com GitHub.
2. Clique em **Add New → Project**.
3. Importe o repositório `FelipeFeerreira/retail-pos-java`.
4. Configure:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Em **Environment Variables**, adicione (opcional):
   - `VITE_API_BASE_URL=/api`
6. Antes do primeiro deploy, edite o arquivo `frontend/vercel.json` e substitua `EMPORIO_POS_API_URL` pela URL real do backend:
   ```json
   {
     "rewrites": [
       { "source": "/api/:path*", "destination": "https://emporio-pos-api.onrender.com/api/:path*" },
       { "source": "/ws/:path*", "destination": "wss://emporio-pos-api.onrender.com/ws/:path*" },
       { "source": "/(.*)", "destination": "/index.html" }
     ]
   }
   ```
7. Clique em **Deploy**.

A versão beta ficará disponível em `https://emporio-pos.vercel.app`.

---

## 4. Acesso demo

Com o profile `demo` ativo, o backend cria automaticamente:

- Usuário: `admin`
- Senha: a definida em `ADMIN_PASSWORD`
- Loja: **Empório Market**
- Idioma padrão: **inglês**
- Produtos, categorias e clientes fictícios para teste

---

## 5. Idioma

O sistema já suporta português e inglês. Na versão demo o idioma padrão é o inglês, mas pode ser alterado em **Settings → Preferences → Language**.

---

## 6. Dados da versão beta

Os dados inseridos pelo seeder são fictícios e servem apenas para demonstração. Para resetar, basta recriar o banco no Neon e reiniciar o backend com `SPRING_PROFILES_ACTIVE=demo`.

---

## 7. Limitações conhecidas da versão online

- **WebSocket / atualizações em tempo real:** podem não funcionar através do proxy da Vercel. O sistema continua funcionando normalmente; apenas as atualizações automáticas ficam desativadas.
- **Impressora térmica e balança COM:** hardware local não está disponível na versão web pública. Na demo esses recursos aparecem desabilitados.
- **Backup e restore:** mantêm funcionamento, mas os arquivos ficam no container do backend (não persistentes no free tier sem volume configurado).
