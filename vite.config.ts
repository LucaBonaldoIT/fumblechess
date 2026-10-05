/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { seo } from './scripts/seo';

export default defineConfig({
  plugins: [seo()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
