// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

export default defineConfig({
	site: "https://equanime.rubrion.ai",
	// No images to transform and no sessions: the adapter would otherwise add IMAGES and SESSION bindings.
	adapter: cloudflare({ imageService: "passthrough" }),
	session: false,
	integrations: [react()],
	devToolbar: { enabled: process.env.EQUANIME_E2E !== "1" },
});
