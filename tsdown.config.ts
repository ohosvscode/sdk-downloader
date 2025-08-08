import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/github-action.ts', './src/index.ts', './src/cli.ts'],
  sourcemap: true,
  dts: true,
  format: ['esm', 'cjs'],
  external: ['@actions/core', '@actions/cache'],
})
