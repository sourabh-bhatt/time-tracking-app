# LiteLLM in the Work Diary Vercel project

The root `vercel.json` deploys the existing Next.js Work Diary and this Python
LiteLLM service together in the **same Vercel project, domain, and deployment**.
Requests to LiteLLM routes such as `/ui`, `/v1`, `/key`, and `/global` go to
LiteLLM before the Work Diary Next.js middleware runs. Other paths, including
`/`, `/login`, `/diary`, `/report`, and `/api/*`, continue to the tracker.

## Required production settings

LiteLLM needs durable PostgreSQL for virtual keys, usage and spend history.
Use a hosted PostgreSQL database (for example, provision one through the Vercel
Marketplace). Require TLS and set its connection string as `DATABASE_URL` in
the existing Work Diary Vercel project's Production environment.

Add these other Production environment variables to that same project:

- `DEEPSEEK_API_KEY`: your DeepSeek key. Rotate any key that appeared in a
  screenshot before adding it.
- `LITELLM_MASTER_KEY`: a new, long, random LiteLLM admin/API secret. Do not
  reuse the local gateway's key.
- `LITELLM_SALT_KEY`: a different, long, random secret. Keep a backup; changing
  it later can make encrypted credentials unreadable.
- `UI_USERNAME` and `UI_PASSWORD`: credentials for LiteLLM's Admin UI. Keep
  them different from the master key.

Commit and push the root `vercel.json` with the LiteLLM files. The existing
Vercel project then builds both services together. After deployment, the
LiteLLM Admin UI is at `https://time-tracking-app-two-nu.vercel.app/ui`, and
OpenAI-compatible clients use
`https://time-tracking-app-two-nu.vercel.app/v1`.

In the Admin UI, create one Virtual Key per client/person and allow the
`deepseek-v4-flash` model. Use that virtual key in Cline or a CLI tool. Do not
use the DeepSeek provider key or master key in client tools. The repository's
`../chat.ps1` prompts for a virtual key without echoing it; pass the deployed
base URL with `-BaseUrl` to smoke test it.

## Storage and request logging

The Work Diary's screenshot S3 bucket cannot replace PostgreSQL. S3 can be
configured as a separate LiteLLM request-log archive, but virtual keys, budgets,
and the Admin UI's usage/spend records still require PostgreSQL. If enabling S3
logging, use a dedicated `litellm/` prefix and least-privilege AWS credentials;
request callbacks may receive prompt and response content. Prompt storage in
LiteLLM's database remains disabled by default.
