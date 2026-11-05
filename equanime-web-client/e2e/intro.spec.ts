import { expect, test } from "@playwright/test";

test("the video opens on the first visit, once, and again from the home page", async ({ page }) => {
	await page.goto("/");
	const dialog = page.getByRole("dialog", { name: "A Equânime em três minutos" });
	await expect(dialog).toBeVisible();
	await expect(dialog.locator("video track")).toHaveAttribute("srclang", "pt-BR");
	await dialog.getByRole("button", { name: "Agora não" }).click();
	await expect(dialog).toBeHidden();

	await page.reload();
	await expect(dialog).toBeHidden();

	await page.getByRole("button", { name: "Ver o vídeo" }).click();
	await expect(dialog).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
});
