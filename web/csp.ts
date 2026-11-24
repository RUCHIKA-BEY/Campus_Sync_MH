// Content-Security-Policy: the browser refuses anything not listed here,
// so even if an attacker managed to inject a <script>, it would not run.
// Used by `vite preview` (local check) and must match vercel.json, which a
// unit test (src/lib/csp.test.ts) enforces.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",                                            // no inline or third-party scripts
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // React style={} attributes + Google Fonts CSS
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.supabase.co",             // QR codes are data: URLs
  "media-src 'self' blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co", // only our Supabase project
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",                                       // nobody may embed CampusSync in a frame
].join('; ');
