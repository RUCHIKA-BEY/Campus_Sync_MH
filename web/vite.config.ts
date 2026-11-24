/// <reference types="vitest/config" />
// Vite builds the React app in web/ into dist/ (served by Vercel after the
// switch-over). The legacy static site in public/ is untouched.
import { defineConfig, loadEnv, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { CSP } from './csp';

const here = fileURLToPath(new URL('.', import.meta.url));
const envDir = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ command, mode }) => {
  // On Vercel, refuse to build without the Supabase settings. Otherwise the
  // deploy would silently become a sample-data site with no sign-in.
  if (command === 'build' && process.env.VERCEL) {
    const env = loadEnv(mode, envDir, 'VITE_');
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter(k => !env[k]);
    if (missing.length) {
      throw new Error(`Missing ${missing.join(' and ')}. Add them in Vercel → Project → Settings → Environment Variables, then redeploy.`);
    }
    if (env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_secret_')) {
      throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY contains a SECRET key. Use the publishable key, and rotate the secret key.');
    }
  }
  return config;
});

const config = {
  root: here,
  // .env files live in the project root. Only variables starting with
  // VITE_ are ever exposed to browser code, so SUPABASE_SECRET_KEY and
  // DEMO_PASSWORD in the same .env can never leak into the bundle.
  envDir,
  plugins: [react(), tailwindcss()],
  server: { port: 5500, strictPort: true },
  // Same security headers as vercel.json, so `npm run preview` tests them locally.
  preview: { port: 5500, strictPort: true, headers: { 'Content-Security-Policy': CSP } },
  build: {
    outDir: fileURLToPath(new URL('../dist', import.meta.url)),
    emptyOutDir: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
} satisfies UserConfig;
