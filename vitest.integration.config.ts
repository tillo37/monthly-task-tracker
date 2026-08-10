import { defineConfig } from 'vitest/config';

/**
 * Integration tests run against a real Supabase stack (`npm run supabase:start`)
 * rather than a mock, because the things they check — Row Level Security,
 * generated columns, SQL aggregation — only exist in Postgres. They are kept
 * out of the default suite so `npm test` stays fast and offline.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['supabase/tests/**/*.test.ts'],
    // Users, sessions and rankings are shared state; running files in parallel
    // would let one suite's data drift into another's leaderboard.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
