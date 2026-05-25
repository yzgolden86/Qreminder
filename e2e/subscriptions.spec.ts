import { expect, test } from "@playwright/test";

const testEmail = "e2e-test@example.com";
const testPassword = "password123456";
const testName = "E2E Tester";

test.describe("Core flow: register, login, create subscription", () => {
  test("register a new account", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("名称").fill(testName);
    await page.getByLabel("邮箱").fill(testEmail);
    await page.getByLabel("密码").fill(testPassword);
    await page.getByRole("button", { name: "注册" }).click();
    await expect(page).toHaveURL(/\/(login)?$/, { timeout: 15_000 });
  });

  test("login and reach dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("邮箱").fill(testEmail);
    await page.getByLabel("密码").fill(testPassword);
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  });

  test("create a subscription from dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("邮箱").fill(testEmail);
    await page.getByLabel("密码").fill(testPassword);
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    await page.getByRole("button", { name: /添加.*订阅/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "添加新订阅" });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("服务名称").fill("Netflix");
    await dialog.getByLabel("价格").fill("15.99");

    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/subscriptions") && res.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "添加订阅" }).click();
    const response = await responsePromise;
    expect(response.ok()).toBe(true);

    await expect(page.getByText("Netflix")).toBeVisible({ timeout: 5_000 });
  });

  test("subscription persists after reload", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("邮箱").fill(testEmail);
    await page.getByLabel("密码").fill(testPassword);
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    await expect(page.getByText("Netflix")).toBeVisible({ timeout: 5_000 });
    await page.reload();
    await expect(page.getByText("Netflix")).toBeVisible({ timeout: 5_000 });
  });

  test("settings page loads", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("邮箱").fill(testEmail);
    await page.getByLabel("密码").fill(testPassword);
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "系统配置" })).toBeVisible({ timeout: 5_000 });
  });
});
