# Restore production login on Vercel

The login API intentionally fails closed when its authentication settings are absent or malformed. The production login error means Vercel has not received the same settings that exist in the local, ignored `.env.local` file.

## Configure the production project

1. Open the Vercel project that serves `time-tracking-app-two-nu.vercel.app`.
2. Open **Settings → Environment Variables**.
3. Add these four variables for the **Production** environment. Copy each value from the matching line in the local `.env.local` file; do not commit that file or paste its contents into source control or chat.

   - `AUTH_SESSION_SECRET`
   - `AUTH_ADMIN_PASSWORD_HASH`
   - `AUTH_SOURABH_PASSWORD_HASH`
   - `AUTH_PRAYASH_PASSWORD_HASH`

4. Save the variables, then redeploy the latest production deployment so the running server receives them.
5. Open `/login` and sign in. If the server still returns a setup error, inspect the deployment's runtime logs. The login API logs only the names of missing or invalid variables, never their values.

The password variables must be scrypt hashes in the format `scrypt:<32 lowercase hex characters>:<128 lowercase hex characters>`. The session secret must contain at least 32 characters. Do not replace these settings with plaintext passwords or commit real secret values.

## For future deployments

Set these values in Vercel before promoting a deployment to Production. Local `.env.local` files are ignored by Git and are not automatically uploaded to Vercel. Vercel does not inherit local environment variables during a Git-based deployment.
