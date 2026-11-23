import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { policyHtml } from '../tools/website/policy.mjs';

export default defineConfig({
  plugins: [
    {
      name: 'aura-policies',
      transformIndexHtml: (html) =>
        html
          .replace('<!-- PRIVACY -->', policyHtml('PRIVACY.md'))
          .replace('<!-- MUSIC_TERMS -->', policyHtml('MUSIC_TERMS.md')),
    },
  ],
  root: fileURLToPath(new URL('./', import.meta.url)),
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        privacy: fileURLToPath(new URL('./privacy.html', import.meta.url)),
        terms: fileURLToPath(new URL('./music-terms.html', import.meta.url)),
      },
    },
  },
  server: { port: 1430, strictPort: true },
});
