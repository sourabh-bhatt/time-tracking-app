# LiteLLM in the Work Diary Vercel project

The root `vercel.json` deploys the existing Next.js Work Diary and this Python
LiteLLM service together in the same Vercel project, domain, and deployment.
Requests for LiteLLM routes such as `/v1` go to LiteLLM; tracker routes continue
to use the Next.js service.

## Database-free production setup

This deployment runs LiteLLM in DB-less mode, so it does not need PostgreSQL.
The model and DeepSeek provider key load from the config file and environment.
Add these Production environment variables to the existing Work Diary Vercel
project:

- `DEEPSEEK_API_KEY`: your DeepSeek key. Rotate any key that appeared in a
  screenshot before adding it.
- `LITELLM_MASTER_KEY`: a new, long, random secret. In DB-less mode, this is the
  only API key accepted by LiteLLM. Keep it private and do not reuse the local
  gateway key.

After deployment, OpenAI-compatible clients use
`https://time-tracking-app-two-nu.vercel.app/v1` and model
`deepseek-v4-flash`. Configure Cline or a CLI tool with the base URL, model
alias, and `LITELLM_MASTER_KEY` as its API key. The master key grants full
gateway access, so do not share it.

The LiteLLM Admin UI, virtual-key creation, per-user budgets, and persistent
usage/spend history require a database and are not available in DB-less mode.
For this single-user setup, manage the provider key and model by editing the
Vercel environment variables and config in this repository.

## Storage and charges

The Work Diary's screenshot S3 bucket is not needed for this setup and does not
act as a database. LiteLLM forwards requests to DeepSeek with the configured
provider key; check usage and charges in the DeepSeek account.
