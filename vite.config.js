import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deployed at https://aaaven.github.io/meetphds/
export default defineConfig({
  plugins: [react()],
  base: '/meetphds/',   // IMPORTANT for project sites under aaaven.github.io
})