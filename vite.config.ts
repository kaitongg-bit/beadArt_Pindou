import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ''); // 这里改了一点，读取当前目录更稳
  return {
    // 👇【关键修复1】加上这一行，告诉它这是独立域名，要在根目录找文件
    base: '/', 
    
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      // 👇 这里是为了把 API Key 传给前端，防止报错
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    // 👇【关键修复2】确保打包输出目录叫 dist，配合 Cloudflare
    build: {
      outDir: 'dist',
    }
  };
});
