import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// BUILD_NUMBER is set by the APK workflow so the app knows which build it is (0 = not a release build).
export default defineConfig({ plugins: [react()], base: './', define: { __BUILD__: JSON.stringify(process.env.BUILD_NUMBER ?? '0') } });
