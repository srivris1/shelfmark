import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // each file boots its own in-memory Postgres, give it room
    testTimeout: 20000,
    hookTimeout: 30000,
    coverage: {
      include: ['src/**/*.js'],
      exclude: ['src/index.js', 'src/seed.js'],
    },
  },
})
