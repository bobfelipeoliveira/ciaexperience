import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH é definido automaticamente pelo GitHub Actions com o nome do repositório
// (ex.: /cia-experience/). Em desenvolvimento local fica "/".
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
