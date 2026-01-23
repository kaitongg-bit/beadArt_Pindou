import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 👇【关键修复】这一行必须加！否则在自定义域名下找不到文件就会白屏
  base: '/', 
  
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  // 👇【保险起见】强制告诉它打包好的东西放在 dist 文件夹
  build: {
    outDir: 'dist',
  }
});
