import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

// Relative base so the build works from any static host path (GitHub Pages, Vercel, Netlify).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
  },
});
