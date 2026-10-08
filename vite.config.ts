/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { designSystem } from '@lucabonaldo/design/vite';
import { seo } from './scripts/seo';

export default defineConfig({
  plugins: [designSystem(), seo()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
