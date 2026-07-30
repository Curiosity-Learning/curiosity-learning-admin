# Curiosity Learning — Admin

Internal admin dashboard for Curiosity Learning, split out of the main app
(`curiosity-learning-frontend-svelte`) into its own repo per the CEO's architecture decision:
the admin dashboard is hosted separately, but shares the same Convex backend and auth as the
main app.

This repo has **no backend of its own**. All Convex functions used here (`admin.ts`,
`moderation.ts`, `profiles.getMyGlobalRole`, `auth.ts`, schema, etc.) live in
`curiosity-learning-frontend-svelte/src/convex/` and are deployed from that repo only. This app
is a pure client of that shared Convex deployment.

## Setup

```bash
npm install
npm run sync-api        # copies the Convex generated API from the main repo (see below)
cp .env.example .env    # fill in PUBLIC_CONVEX_URL / PUBLIC_CONVEX_SITE_URL
npm run dev              # http://localhost:4174 (port is strict, matches trustedOrigins)
```

Sign in with an account whose profile has `globalRole: "admin"` set in the shared Convex
deployment (the same one the main app uses).

## Shared-backend architecture

- **Convex backend**: shared with the main app. This repo does not run `convex dev`, does not
  have a `convex/` folder of functions, and does not deploy anything to Convex.
- **Auth**: shared better-auth + Convex session, same as the main app. See "How auth works"
  below — this app performs authentication access **client-side only**, so it never uses
  `BETTER_AUTH_SECRET` or the Google OAuth client secret; those remain in the main repo /
  Convex deployment env only.
- **Generated API types**: synced from the main repo via `npm run sync-api` (see below), not
  generated locally.

## How auth works

The main app's SvelteKit server (`hooks.server.ts` + `+layout.server.ts`) reads the better-auth
session cookie server-side (via `getToken(createAuth, cookies)`) to SSR-gate `/admin` and other
routes. That requires importing the main repo's full `createAuth` (which pulls in the Convex
functions module, email templates, etc.) — too heavy to duplicate here, and unnecessary for an
admin tool.

Instead, this app authenticates **entirely client-side**:

- `src/routes/+layout.svelte` calls `createSvelteAuthClient({ authClient })` (no
  `getServerState`), which uses `authClient.useSession()` + the Convex JWT exchange, exactly
  like the main app's browser flow — just without the SSR fast-path.
- `src/routes/admin/+layout.svelte` is the gate: it waits for `useAuth()` to resolve, then calls
  `api.profiles.getMyGlobalRole` (a shared Convex query). Non-admins (or unauthenticated users)
  see a plain "Not found", matching the main app's behavior of not advertising `/admin`'s
  existence. Unauthenticated users are redirected to `/sign-in`.
- Every admin Convex query/mutation still independently enforces `requireGlobalAdmin`
  server-side (in the main repo) — the client-side gate here is a UX nicety only, same caveat as
  the main app's server-side gate.

This means: no `hooks.server.ts`, no `app.d.ts` `Locals.token`, no `BETTER_AUTH_SECRET` needed in
this repo's `.env`. `authClient` (`src/lib/auth-client.ts`) only needs
`convexClient()` from `@convex-dev/better-auth/client/plugins` — the member app's
`emailOTP`/`username` client plugins aren't used since sign-in here is a simple email/password
form for admins (who are ordinary users with `globalRole: "admin"`).

One SvelteKit server route _is_ still needed: `src/routes/api/auth/[...all]/+server.ts`, ported
verbatim from the main repo. `authClient` posts to same-origin `/api/auth/*` by default; this
route is a thin, secret-free proxy (`createSvelteKitHandler()`) that forwards those requests to
`PUBLIC_CONVEX_SITE_URL` (a public env var) — it holds no secrets and requires no `createAuth`
import, so it doesn't reintroduce the heavy dependency described above.

**Origin allowlisting**: for the Convex JWT/session exchange to work, this app's origin
(`http://localhost:4174` in dev) must be in the main repo's `trustedOrigins` list
(`src/convex/auth.ts`) and pushed to the shared Convex deployment with `npx convex dev --once`.
When this app is deployed, add its deployed origin there too.

**Google OAuth needs cross-subdomain cookies in production**: Google always calls back on
`BETTER_AUTH_URL`'s origin (the member app), so the Better Auth state cookie set through this
app's `/api/auth` proxy — and the session cookie set during the callback — must be visible on
both origins. The main repo's `src/convex/auth.ts` scopes auth cookies to `AUTH_COOKIE_DOMAIN`
(a Convex env var, `.curiositylearning.org` in prod) to make that work; without it, Google
sign-in started here dies with `state_mismatch` on the member app's `/api/auth/error` page.
Localhost dev needs nothing — cookies ignore ports, so `:4174` and `:5173` already share them.

## sync-api mechanism

`npm run sync-api` runs `scripts/sync-api.sh`, which copies
`../curiosity-learning-frontend-svelte/src/convex/_generated` into this repo's
`src/convex-api/_generated` (committed — Vercel builds have no sibling main-repo checkout to
sync from; regenerate via the script, never hand-edit). The `$convex`
alias in `svelte.config.js` points at `src/convex-api`, so imports like
`import { api } from '$convex/_generated/api'` resolve to the synced copy, matching the import
style used in the main repo's admin pages.

**Re-run `npm run sync-api` after any backend change in the main repo and commit the result**
(new/changed Convex queries/mutations, schema changes) — otherwise this app's `api` object and
`Id<...>` types go stale, locally and on Vercel. The script assumes this repo is checked out as a sibling directory of
`curiosity-learning-frontend-svelte`.

## i18n divergence

The main app is internationalized (`$lib/i18n`); this admin app is **not** — it's an internal
tool, so English strings are inlined directly in the ported pages instead of going through the
translation layer. If the admin app ever needs i18n, port `$lib/i18n` from the main repo at that
point.

## Admin access & invites

Admin access is granted only through the admin-invite mechanism (main repo
`src/convex/adminInvites.ts`):

- An existing admin invites an email on **/admin/admins**; the invitee signs in (or creates an
  account right on this portal, with email OTP verification) and is granted
  `globalRole: "admin"` automatically when their verified email matches a pending invite.
- Invites expire after 7 days, can be revoked while pending, and every invite row is kept as an
  audit trail. Admins can remove other admins (never themselves — the platform can't reach zero
  admins).
- Bootstrapping the first admin on a fresh deployment (from the main repo checkout):
  `npx convex run adminInvites:seedInvite '{"email": "person@example.com"}' [--prod]`

## Ron's TODOs

- [x] Create a GitHub remote for this repo and push — done 2026-07-24:
      https://github.com/Curiosity-Learning/curiosity-learning-admin (private).
- [ ] Set up the Vercel project for this repo (`adapter-vercel` is already configured). Env
      vars needed: `PUBLIC_CONVEX_URL` and `PUBLIC_CONVEX_SITE_URL` (same values as the main
      app's production env). Root directory = repo root; no Convex deploy step — the backend
      deploys from the main repo.
- [ ] Once deployed, set `ADMIN_APP_ORIGIN` (e.g. `https://curiosity-learning-admin.vercel.app`
      or the custom domain) as a **Convex production env var** in the main repo's deployment —
      it feeds both `trustedOrigins` (auth) and the invite email's portal link. Dev already
      trusts `http://localhost:4174`.
- [ ] Set `PUBLIC_ADMIN_URL` in the main app's Vercel env to this app's deployed URL, so the
      profile page's "Admin" link appears for admins in production too (in dev it already
      points at `http://localhost:4174`).
- [ ] Consider whether this repo needs its own CI (lint/check) now that it has a remote.
