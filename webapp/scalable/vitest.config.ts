import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.tsx'],
    include: ['tests/**/*.test.{ts,tsx}'],
    pool: 'forks',
    maxWorkers: 4,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['lib/**/*.ts', 'components/**/*.tsx', 'app/**/*.tsx'],
      exclude: [
        '**/node_modules/**',
        '**/components/ui/**',
        '**/*.d.ts',
        '**/.next/**',
        '**/app/layout.tsx',
        '**/app/dashboard/layout.tsx',
        '**/app/dashboard/images/page.tsx',
        '**/components/auth-provider.tsx',
        '**/app/dashboard/vault/page.tsx',
      ],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './') },
  },
});
