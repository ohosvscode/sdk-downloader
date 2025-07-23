import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', './src/cli.ts'],
  sourcemap: true,
  dts: true,
  format: ['esm', 'cjs'],
})
