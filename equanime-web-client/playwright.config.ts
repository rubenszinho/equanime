import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4329" },
	webServer: {
		// --ignore-lock keeps astro dev in the foreground even when it detects an AI agent.
		command: "npx astro dev --ignore-lock --host 127.0.0.1 --port 4329",
		port: 4329,
		reuseExistingServer: false,
		env: { EQUANIME_E2E: "1" },
	},
});
