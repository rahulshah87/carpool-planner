import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 85,
        functions: 90,
        branches: 75,
        statements: 85,
      },
      exclude: ['dist/**', 'src/index.ts', 'src/db.ts'],
    },
  },
});
