# Time Tracker

Run the desktop app with `npm start`. Run the dashboard with `npm run dev`.

Windows screenshots use Electron's built-in screen capture API and stay in memory
until uploaded. The old `screenshot-desktop` Windows helper compiled an executable
under `%TEMP%`; Device Guard began blocking it on November 16, 2026. The new
implementation does not require disabling Windows security. It captures the
primary display at its native pixel size. Linux and macOS retain their existing
capture paths. Capture failures and storage failures now have separate messages.

Dashboard authentication requires these server environment variables:

- `AUTH_SESSION_SECRET`: at least 32 random characters, shared across dashboard instances.
- `AUTH_ADMIN_PASSWORD_HASH`, `AUTH_SOURABH_PASSWORD_HASH`, `AUTH_PRAYASH_PASSWORD_HASH`:
  salted scrypt hashes. Run `npm run auth:hash-password` in an interactive terminal
  for each new password; input is hidden. Copy the resulting hash into the variable.

Use `.env.local` for local dashboard configuration and your hosting provider's
environment settings in production. There are no default passwords. Missing
configuration rejects logins. Existing unsigned cookies are invalid; users must
log in again. Rotating `AUTH_SESSION_SECRET` invalidates all signed sessions.
The local configuration was migrated to salted hashes without changing existing
passwords. **Rotate all old passwords before deploying**: they previously appeared
in source control. Configure login throttling at the hosting perimeter for a
public deployment; the app has no distributed brute-force limiter.

Desktop configuration is separate: `.env.desktop` contains only storage credentials,
`USER_ID`, tracking timezone and on-call settings. The local file was copied from
the existing storage settings. New Windows and electron-builder packages exclude
`.env`, `.env.local`, dashboard code, Google credentials, and web authentication
secrets. Build the portable Windows app with `npm run build:portable-win`; the
existing launchers will use that output after the running app is closed.

**Windows launch requirement:** the unsigned November 17 portable EXE is blocked
by Smart App Control. Portable release builds now require a trusted signing identity and
verify Windows binary signatures. No identity is configured yet, so a working
signed standalone release is still pending. See [Windows signing setup](docs/windows-signing.md).
Use `npm run build:portable-win:dev` only for an explicitly unsigned development
artifact; it is placed in a separate folder and may also be blocked by Windows.

**Remaining architecture risk:** the desktop still accesses S3 directly. Anyone
who receives its AWS credentials can exercise the IAM permissions attached to
those credentials, independent of the app's user selector. Give each employee
a narrowly scoped identity with access only to their own images, logs, indexes
and state. Do not distribute this local `.env.desktop` with an administrator key.
Use a server API with authenticated, scoped uploads to remove AWS keys from
distributed clients. Previously distributed builds may include broader AWS and
Google credentials; rotate them and review access logs. This code review does
not establish whether any credentials were misused.

Private screenshot responses now use `Cache-Control: private, no-store`. When
deploying, purge previously cached `/api/image/*` responses from any CDN/cache
you control; changing the response header cannot revoke an already cached copy.

Verification:

- `npm test`: capture failure cases, session forgery/tampering/expiry, login,
  screenshot access and cache headers, and server-action authorization.
- `npm run verify:desktop`: captures one image in memory, checks the native input
  hook, and exercises the isolated renderer and screenshot preview. It uploads
  nothing and records no tracked time.
- `node scripts/verify-storage.js`: uploads, reads and deletes a temporary 1-pixel
  image in the configured employee's S3 image prefix without creating logs or time.
- `npx tsc --noEmit` and `npm run build`: dashboard checks.
- `npm audit` and `npm audit --omit=dev`: dependency advisories.

The November 17, 2026 checks passed: 12 regression tests, TypeScript, targeted lint,
the production dashboard build, native Windows capture/input/UI, and an S3 image
upload/read/delete. The production dependency audit reports zero advisories.
The full audit retains six moderate development packaging advisories associated
with electron-builder's minimatch dependencies. No critical or high advisories
remain; avoid `npm audit fix --force`, which proposes an older builder release.
