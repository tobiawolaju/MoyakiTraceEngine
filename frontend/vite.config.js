import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const configDir = dirname(fileURLToPath(import.meta.url));
const readmeLogoPath = resolve(configDir, '../logo.png');

function readmeLogoAsset() {
  return {
    name: 'readme-logo-asset',
    configureServer(server) {
      server.middlewares.use('/logo.png', (_req, res) => {
        res.setHeader('Content-Type', 'image/png');
        res.end(readFileSync(readmeLogoPath));
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'logo.png',
        source: readFileSync(readmeLogoPath)
      });
    }
  };
}

export default defineConfig({
  plugins: [readmeLogoAsset(), svelte()],
  server: {
    port: 5173
  }
});
