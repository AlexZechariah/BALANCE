import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@balance/config': fileURLToPath(new URL('../../packages/config/src/index.ts', import.meta.url)),
      '@balance/types': fileURLToPath(new URL('../../packages/types/src/index.ts', import.meta.url)),
      '@balance/ui': fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    environment: 'node'
  }
});
