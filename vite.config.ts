import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: '127.0.0.1',
    watch: {
      ignored: [
        '**/tools/music/.venv/**',
        '**/tools/music/build/**',
        '**/tools/music/dist/**',
        '**/artifacts/**',
      ],
    },
  },
  build: { target: 'es2022' },
});
