import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: process.env.CI ? ['./src/github-action.ts'] : ['./src/index.ts', './src/cli.ts'],
  sourcemap: true,
  dts: true,
  format: ['esm', 'cjs'],
  external: ['@actions/core']
})
