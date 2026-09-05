import 'cloudflare:workers';
declare module 'cloudflare:workers' {
  interface Env { DB:D1Database; ASSETS:Fetcher; }
}
