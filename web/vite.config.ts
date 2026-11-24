/// <reference types="vitest/config" />
// Vite builds the React app in web/ into dist/ (served by Vercel after the
// switch-over). The legacy static site in public/ is untouched.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: here,
  // .env files live in the project root. Only variables starting with
  // VITE_ are ever exposed to browser code, so SUPABASE_SECRET_KEY and
  // DEMO_PASSWORD in the same .env can never leak into the bundle.
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [react(), tailwindcss()],
  server: { port: 5500, strictPort: true },
  preview: { port: 5500, strictPort: true },
  build: {
    outDir: fileURLToPath(new URL('../dist', import.meta.url)),
    emptyOutDir: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
