import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { build } from 'vite';

// 自定义插件：单独构建 content script 为 IIFE 格式
function contentScriptPlugin(): Plugin {
  return {
    name: 'content-script-build',
    async closeBundle() {
      // 在主构建完成后，单独构建 content script
      await build({
        configFile: false,
        build: {
          emptyOutDir: false,
          outDir: 'dist',
          lib: {
            entry: resolve(__dirname, 'src/content/job-pages.ts'),
            name: 'JobGodContent',
            formats: ['iife'],
            fileName: () => 'content/job-pages.js',
          },
          rollupOptions: {
            output: {
              // 确保所有依赖都内联
              inlineDynamicImports: true,
            },
          },
        },
      });
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        options: resolve(__dirname, 'options.html'),
        popup: resolve(__dirname, 'popup.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [
    {
      name: 'static-copy',
      async closeBundle() {
        const { viteStaticCopy } = await import('vite-plugin-static-copy');
        // 手动复制 manifest.json
        const fs = await import('fs');
        fs.copyFileSync('manifest.json', 'dist/manifest.json');
      },
    },
    contentScriptPlugin(),
  ],
});
