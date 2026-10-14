// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

export default defineConfig({
	adapter: cloudflare(),
	integrations: [react()],
	devToolbar: { enabled: process.env.EQUANIME_E2E !== "1" },
});
