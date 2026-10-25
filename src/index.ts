/**
 * Worker entrypoint.
 *
 * The application logic lives in the `@startup-api/cloudflare` package. This
 * file builds a configured instance with the `createStartupAPI` factory and
 * re-exports its fetch handler and Durable Object classes so Wrangler can
 * discover them.
 *
 * Two layers of configuration work together:
 *
 *   1. Environment variables (in `wrangler.jsonc` `vars`, `.dev.vars`, or the
 *      Cloudflare dashboard) hold credentials/secrets and per-deployment
 *      values: `ORIGIN_URL`, `SESSION_SECRET`, the `*_CLIENT_ID` /
 *      `*_CLIENT_SECRET` pairs, `AUTH_ORIGIN`, `USERS_PATH`, `ADMIN_IDS`.
 *      A provider turns on automatically once its client id + secret are set.
 *
 *   2. The factory config below holds non-secret behavior: which providers to
 *      configure, extra OAuth scopes, the Patreon campaign id, entitlement
 *      freshness, feature flags, plans and the access policy.
 *
 * See README.md for the full list of variables and factory options.
 */
import { createStartupAPI } from '@startup-api/cloudflare';

const api = createStartupAPI({
  providers: {
    // AT Protocol (Atmosphere) — a public OAuth client: no client id/secret
    // and nothing to register. Including this key enables it (or set
    // ATPROTO_ENABLED truthy in env). Users sign in with their handle/DID.
    atproto: {
      // clientName: 'My App', // shown on the consent screen (default 'StartupAPI')
      // scopes: 'transition:generic', // extra scopes on top of the base 'atproto'
    },
    // Enabled once GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set.
    google: {
      // scopes: 'https://www.googleapis.com/auth/calendar.readonly',
    },
    // Enabled once TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET are set.
    twitch: {
      // scopes: 'channel:read:subscriptions',
    },
    // Enabled once PATREON_CLIENT_ID / PATREON_CLIENT_SECRET are set.
    patreon: {
      // Request membership data so entitlements (active patron, tiers,
      // benefits) can be read and forwarded to your origin.
      // scopes: 'identity.memberships',
      // campaignId: '<CAMPAIGN_ID>',
      // Keep entitlements fresh. `cron` also needs a matching `triggers.crons`
      // in wrangler.jsonc; `webhook` also needs PATREON_WEBHOOK_SECRET in env.
      // freshness: { ttl: true, cron: { schedule: '0 */6 * * *' }, webhook: true },
    },
  },

  // Feature flags (see the framework's specs/features.md). A mix of states so the admin dashboard
  // (/users/admin/) and the origin pages show every case.
  features: [
    { id: 'reports', name: 'Reports', rolled_out_to_all_users: true },
    { id: 'legacy_export', name: 'Legacy export', enabled: false },
    { id: 'chat', name: 'Chat', emergency_shutdown: true },
    { id: 'pro_reports', name: 'Pro reports' },
    { id: 'beta', name: 'Beta' },
  ],

  // Plans can grant features. Switch an account's plan in the admin dashboard.
  plans: [
    { slug: 'free', name: 'Free' },
    { slug: 'pro', name: 'Pro', features: ['pro_reports'] },
  ],

  // Gate paths on the origin (see origin/src/index.ts for the pages). Admins pass every rule, so
  // impersonate a regular user from the admin dashboard to see a rule deny access.
  accessPolicy: {
    rules: [
      { pattern: '/app/*', requirement: { mode: 'authenticated' }, on_unauthorized: 'login' },
      { pattern: '/beta/*', requirement: { mode: 'feature', feature: 'beta' }, on_unauthorized: 'forbidden' },
    ],
    default: { mode: 'public' },
  },
});

// `api.default` includes a `scheduled()` handler only when a provider enables
// cron freshness above.
export default api.default;
export const { UserDO, AccountDO, SystemDO, CredentialDO } = api;
