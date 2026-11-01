import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Preserve the browser compilation targets used before the Vite upgrade.
  build: { target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'] },
  test: {
    environment: 'node',
    globals: true,
    maxWorkers: 2,
  },
});
