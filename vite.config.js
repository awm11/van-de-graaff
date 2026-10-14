import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves project sites from /<repo-name>/, so the build needs
// that prefix — but local dev should stay at '/' so `npm run dev` just works.
const REPO_NAME = 'van-de-graaff';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' && REPO_NAME ? `/${REPO_NAME}/` : '/',
}));
