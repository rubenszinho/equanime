import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4321" },
	webServer: {
		command: "npm run dev -- --host 127.0.0.1 --port 4321",
		port: 4321,
		reuseExistingServer: false,
		env: { EQUANIME_E2E: "1" },
	},
});
