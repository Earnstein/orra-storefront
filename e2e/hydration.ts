import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Navigates without waiting for the load event (which waits for every image, and times out when
 * the image CDN is slow), then waits until React has hydrated `control`, so the test's first click
 * or keypress reaches its handler. React marks the elements it manages with `__reactProps$…`.
 */
export async function gotoHydrated(page: Page, url: string, control: (page: Page) => Locator) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await hydrated(control(page));
}

/** Waits until React has hydrated the element (see gotoHydrated). */
export async function hydrated(locator: Locator) {
  await expect
    .poll(() => locator.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps"))), {
      timeout: 15_000,
    })
    .toBe(true);
}
