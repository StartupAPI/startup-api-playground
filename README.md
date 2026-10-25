# StartupAPI playground

A local test site for developing [StartupAPI](https://startupapi.com). It runs your local checkout of [`@startup-api/cloudflare`](https://github.com/StartupAPI/startup-api-cloudflare) through `npm link`, the same way an app created with `npm create startup-api` would use it. Use it to try framework changes in a browser before you open a pull request.

It has two parts, which `npm run dev` starts together:

- **The StartupAPI worker** ([src/index.ts](src/index.ts)) on http://localhost:8273. Its config turns on the framework's features with sample settings: login providers, feature flags, plans and an access policy.
- **An origin app** ([origin/src/index.ts](origin/src/index.ts)) on http://localhost:8274: the "your application" side the worker proxies to. Each page lists the `X-StartupAPI-*` headers it received, so you can see what the framework forwards.

Always open the site at **http://localhost:8273**. Opening the origin on port 8274 directly skips StartupAPI.

The playground uses ports 8273 (worker) and 8274 (origin), with debugger ports 9273 and 9274, so it doesn't clash with other Workers projects on wrangler's default 8787. `npm run dev` stops with an error if one of them is taken.

This project is for local testing only. It isn't deployed anywhere.

## Setup

You need Node.js 20 or newer, and the two repositories side by side:

```bash
git clone https://github.com/StartupAPI/startup-api-cloudflare.git
git clone https://github.com/StartupAPI/startup-api-playground.git

# Register your framework checkout as a global npm link
cd startup-api-cloudflare
npm install
npm link

# Install the playground and point it at that checkout
cd ../startup-api-playground
npm install
npm run link

npm run dev   # creates .dev.vars with a random SESSION_SECRET on the first run
```

`npm run dev` prints which framework copy it is using:

```
[dev] Using local @startup-api/cloudflare 0.8.0 from /path/to/startup-api-cloudflare
```

If it warns that it's using the published package, run `npm run link` again.

## Working on the framework

- **Code changes** in `startup-api-cloudflare/src` reload automatically: `wrangler dev` rebuilds the worker when the linked files change.
- **Static files** in `startup-api-cloudflare/public/users` (the admin dashboard, the power strip, the profile and account pages) are copied into this project's `public/users` when `npm run dev` starts. Restart it to pick up changes there, or run `npm run sync-assets`.
- **Switching framework branches** needs no extra steps: the link points at the checkout folder, so whatever is checked out there is what runs.
- **`npm install` removes the link** (npm replaces it with the published package). Run `npm run link` again afterwards. To go back to the published package on purpose, run `npm run unlink`.
- **Data** (users, accounts, sessions, feature overrides) is stored by `wrangler dev` in `.wrangler/state` and survives restarts. Delete that folder to start over.

To try a new framework option, add it to the `createStartupAPI` config in [src/index.ts](src/index.ts). To show how an app would use it, add a page to [origin/src/index.ts](origin/src/index.ts). Changes that are useful to other contributors are welcome as pull requests to this repository.

## Logging in

At least one login provider has to work locally.

**Google, Twitch or Patreon** (simplest): register an OAuth app with the provider, add the redirect URI `http://localhost:8273/users/auth/<provider>/callback` (for example `.../auth/google/callback`), and put the client id and secret in `.dev.vars`. The provider is enabled once its credentials are set. The links to each provider's developer console are in [.dev.vars.example](.dev.vars.example).

**AT Protocol (Bluesky)** needs no app registration and no credentials. On localhost the framework uses atproto's [localhost client](https://atproto.com/specs/oauth#localhost-client-development) mode, which needs a framework checkout with that support (version 0.7.1 or later). The spec requires an IP address in the redirect URI, so the login moves you from `localhost:8273` to **http://127.0.0.1:8273**, and you stay logged in there. Browse the playground at `127.0.0.1:8273` when you use atproto. Cookies are per host, so `localhost` and `127.0.0.1` have separate sessions.

### Admin access

The admin dashboard is at http://localhost:8273/users/admin/. To get access:

1. Log in.
2. Open http://localhost:8273/users/api/me and copy `profile.id`.
3. Set `ADMIN_IDS` in `.dev.vars` to that id and restart `npm run dev`.

Admins pass the `/app/` login rule, but feature rules like `/beta/` apply to them too: enable `beta` for yourself in the dashboard to get in. To see the login rule deny access, log out or use a second browser profile.

## What to try

### Feature flags

[src/index.ts](src/index.ts) defines a feature in each state, and a Pro plan that grants `pro_reports`.

| Where | What you should see |
| --- | --- |
| `/` (logged out) | `X-StartupAPI-Features: reports`. Only the rolled-out feature, and no storage reads happen. |
| `/` (logged in) | `X-StartupAPI-Features` lists the features enabled for you. Sending your own `X-StartupAPI-Features` header doesn't change it. |
| `/users/admin/` → Features | Status labels: `all users` for Reports, `off` for Legacy export, `down` for Chat, `on` for Pro reports and Beta. Override counts for users and accounts. |
| Admin → account → Edit → plan Pro, then **Features** | Pro reports is checked and locked: "Enabled by subscription plan: Pro". `/reports/` shows the pro content for that account's members. |
| Admin → account → **Features** → check Beta → **Update features** | Members of that account can open `/beta/`; others get 403. On a member's own Features dialog, Beta shows "Enabled in accounts: …" but stays unchecked. |
| `/users/api/me` | A `features` list for the logged-in user. |

### Access policy

- `/app/` requires a logged-in user and sends anonymous visitors to log in.
- `/beta/` requires the `beta` feature and returns 403 without it.
