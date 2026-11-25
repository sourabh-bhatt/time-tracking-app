# LiteLLM on Vercel

This is a separate Vercel project for the LiteLLM gateway. Keep the existing
Work Diary Vercel project unchanged. In the new Vercel project, set the Root
Directory to `litellm/vercel`.

## Required Vercel resources and secrets

LiteLLM needs durable PostgreSQL for virtual keys, usage and spend history.
Provision a PostgreSQL database through Vercel Marketplace (Neon is one option)
and use its pooled or direct connection string as supported by that provider.
Require TLS (`sslmode=require`). Do not use the local Docker database or expose
it to the internet.

Add these Production environment variables in the new Vercel project:

- `DATABASE_URL`: the hosted PostgreSQL connection string.
- `DEEPSEEK_API_KEY`: the DeepSeek provider key. Add it in Vercel's environment
  variable form; never paste it in chat or commit it.
- `LITELLM_MASTER_KEY`: a new, long, random LiteLLM admin/API secret. Do not
  reuse the local gateway's key.
- `LITELLM_SALT_KEY`: a separate, long, random secret used to encrypt provider
  credentials. Keep it backed up; changing it can make encrypted credentials
  unreadable.
- `UI_USERNAME` and `UI_PASSWORD`: a separate admin UI login. Do not reuse the
  master key as the UI password.

After adding the variables, redeploy. The model alias is `deepseek-v4-flash`.
Create one LiteLLM Virtual Key per client/person in the Admin UI and use that
virtual key (never the DeepSeek key or master key) in Cline and CLI tools.
The repository's `../chat.ps1` prompts for that key without echoing it. After
deployment, run it with `-BaseUrl 'https://<your-gateway-domain>/v1'` to smoke
test the hosted gateway.

## Deploy

The official Vercel LiteLLM integration exposes an ASGI app from `app.py`.
Create a *new* Vercel project for this repository (or deploy this folder with
the Vercel CLI) and set its Root Directory to `litellm/vercel`. Do not select
the existing Work Diary project. Add the variables above before production
traffic. The deployed URL's API base will be `https://<your-gateway-domain>/v1`.

Vercel functions are not a persistent Docker host: the database must hold all
durable LiteLLM state. This setup disables the public Swagger/OpenAPI docs;
LiteLLM's UI and API are still internet reachable and rely on strong admin and
virtual keys. Limit who receives virtual keys and set per-key budgets.

## Local-only files

The existing `../.env` and Docker Compose database belong to the local gateway.
They are not used or copied by this Vercel deployment. Do not commit `.env`
files, provider keys, generated API keys, or database credentials.
