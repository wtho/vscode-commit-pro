import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // default: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}']
    include: ['**/*.{test,spec}.{ts,mts,cts,tsx}']
  },
})
