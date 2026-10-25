/**
 * Origin app for the playground. StartupAPI proxies every non-`/users/` request here and adds
 * `X-StartupAPI-*` headers describing the visitor. Each page renders those headers so you can see
 * what the framework forwards, and the pages below exercise the access policy in src/index.ts.
 */

const PAGES: { path: string; title: string; description: string }[] = [
  { path: '/', title: 'Home', description: 'Public. Shows the headers StartupAPI forwarded for this request.' },
  { path: '/app/', title: 'App', description: 'Requires a logged-in user (access policy mode `authenticated`).' },
  { path: '/beta/', title: 'Beta', description: 'Requires the `beta` feature flag (access policy mode `feature`).' },
  { path: '/reports/', title: 'Reports', description: 'Public, but the origin shows extra content when `pro_reports` is enabled.' },
];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function startupApiHeaders(request: Request): [string, string][] {
  return [...request.headers].filter(([name]) => name.toLowerCase().startsWith('x-startupapi-')).sort(([a], [b]) => a.localeCompare(b));
}

function features(request: Request): string[] {
  return (request.headers.get('X-StartupAPI-Features') ?? '').split(',').filter(Boolean);
}

function pageContent(path: string, request: Request): string {
  if (path === '/reports/') {
    return features(request).includes('pro_reports')
      ? '<p class="ok">✅ <code>pro_reports</code> is enabled: here are the pro reports.</p>'
      : '<p class="no">🔒 <code>pro_reports</code> is not enabled. Put your account on the Pro plan in the admin dashboard.</p>';
  }
  if (path === '/app/') return '<p class="ok">✅ You are logged in, so the access policy let you in.</p>';
  if (path === '/beta/') return '<p class="ok">✅ The <code>beta</code> feature is enabled for you.</p>';
  return '';
}

function render(request: Request, path: string): string {
  const page = PAGES.find((p) => p.path === path)!;
  const headers = startupApiHeaders(request);
  const rows = headers.length
    ? headers.map(([name, value]) => `<tr><th>${escapeHtml(name)}</th><td><code>${escapeHtml(value)}</code></td></tr>`).join('')
    : '<tr><td colspan="2">No <code>X-StartupAPI-*</code> headers. Open this page through the worker at http://localhost:8787.</td></tr>';
  const nav = PAGES.map((p) => `<a href="${p.path}"${p.path === path ? ' aria-current="page"' : ''}>${p.title}</a>`).join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${page.title} · StartupAPI playground</title>
    <style>
      :root { color-scheme: light dark; --bg: #fff; --text: #222; --muted: #666; --border: #ddd; --code: #f3f3f3; }
      @media (prefers-color-scheme: dark) { :root { --bg: #1a1a1a; --text: #e0e0e0; --muted: #aaa; --border: #444; --code: #2d2d2d; } }
      body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); max-width: 960px; margin: 0 auto; padding: 3rem 1rem; }
      nav { display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
      nav a[aria-current] { font-weight: bold; }
      .muted { color: var(--muted); }
      table { border-collapse: collapse; width: 100%; }
      th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--border); vertical-align: top; }
      th { white-space: nowrap; }
      code { background: var(--code); padding: 0.1rem 0.3rem; border-radius: 3px; overflow-wrap: anywhere; }
      .ok, .no { font-size: 1.1rem; }
    </style>
  </head>
  <body>
    <nav>${nav}<a href="/users/admin/">Admin</a></nav>
    <h1>${page.title}</h1>
    <p class="muted">${page.description}</p>
    ${pageContent(path, request)}
    <h2>Headers from StartupAPI</h2>
    <table>${rows}</table>
  </body>
</html>`;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const path = pathname.endsWith('/') ? pathname : `${pathname}/`;
    if (!PAGES.some((p) => p.path === path)) return new Response('Not found', { status: 404 });
    return new Response(render(request, path), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  },
} satisfies ExportedHandler;
