// Generated from requirement: specs/product/todomvc.md#creating-a-todo
// Do not weaken assertions merely to make this test pass.

import { test, expect } from '../fixtures.js';

test("User can create a todo item", async ({ page }) => {
  await page.goto("./");

  await page.getByRole("textbox", { name: "What needs to be done?" }).fill("Buy groceries");

  await page.getByRole("textbox", { name: "What needs to be done?" }).press("Enter");

  await expect(page.getByText("Buy groceries", { exact: true })).toBeVisible();

  await expect(page.getByRole("checkbox", { name: "Toggle Todo" })).not.toBeChecked();

  await expect(page.getByText("1 item left", { exact: true })).toBeVisible();

  await expect(page.getByRole("textbox", { name: "What needs to be done?" })).toHaveValue("");

});
