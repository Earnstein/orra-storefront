import { describe, expect, it } from "vitest";

import { deviceLabel } from "@/lib/account/device-label";

const UA = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1",
  chromeLinux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.3537.57",
  edgeAndroid:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 EdgA/141.0.0.0",
  edgeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/141.0.3537.57 Mobile/15E148 Safari/605.1.15",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  safariIpad:
    "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  firefoxWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
  firefoxMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15.6; rv:143.0) Gecko/20100101 Firefox/143.0",
  firefoxIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/143.0 Mobile/15E148 Safari/605.1.15",
  samsungAndroid:
    "Mozilla/5.0 (Linux; Android 15; SM-S931B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
};

describe("deviceLabel", () => {
  it.each([
    [UA.chromeMac, "Chrome on macOS"],
    [UA.chromeWindows, "Chrome on Windows"],
    [UA.chromeAndroid, "Chrome on Android"],
    [UA.chromeIphone, "Chrome on iPhone"],
    [UA.chromeLinux, "Chrome on Linux"],
    [UA.edgeWindows, "Edge on Windows"],
    [UA.edgeAndroid, "Edge on Android"],
    [UA.edgeIphone, "Edge on iPhone"],
    [UA.safariMac, "Safari on macOS"],
    [UA.safariIphone, "Safari on iPhone"],
    [UA.safariIpad, "Safari on iPad"],
    [UA.firefoxWindows, "Firefox on Windows"],
    [UA.firefoxMac, "Firefox on macOS"],
    [UA.firefoxIphone, "Firefox on iPhone"],
    [UA.samsungAndroid, "Samsung Internet on Android"],
  ])("%s → %s", (userAgent, label) => {
    expect(deviceLabel(userAgent)).toBe(label);
  });

  it("names the system when the browser isn't one it knows", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0) SomeBrowser/1.0")).toBe("Browser on Windows");
  });

  it("falls back for missing or unknown values", () => {
    expect(deviceLabel(null)).toBe("Unknown device");
    expect(deviceLabel(undefined)).toBe("Unknown device");
    expect(deviceLabel("")).toBe("Unknown device");
    expect(deviceLabel("curl/8.7.1")).toBe("Unknown device");
  });
});
