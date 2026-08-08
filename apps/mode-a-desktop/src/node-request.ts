import http from 'node:http';
import https from 'node:https';

// Electron's main-process global `fetch` runs on Chromium's network stack
// (net.fetch under the hood) and attaches an `Origin: null` header to
// cross-origin requests even from a non-browser context. better-auth's
// origin-check/CSRF middleware (since ~v1.3.29) rejects that outright as
// "Missing or null Origin" — before it ever checks `trustedOrigins`, so
// listing the desktop app's origin server-side wouldn't help
// (better-auth/better-auth#7793). Node's own http/https client never
// synthesizes an Origin header, so requests made through it don't trip
// that check at all — used here instead of fetch for exactly that reason.
export interface NodeResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export function nodeRequest (
  url: URL,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<NodeResponse> {
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(url, { method: options.method ?? 'GET', headers: options.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf8');
        const status = res.statusCode ?? 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          headers: { get: (name: string) => (res.headers[name.toLowerCase()] as string | undefined) ?? null },
          json: async () => bodyText ? JSON.parse(bodyText) : undefined,
        });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}
