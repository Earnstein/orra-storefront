// A short "<Browser> on <System>" label for a session's user agent, for the signed-in devices list.
// Hand-written rather than a dependency: only five browsers and six systems are named. Order
// matters: Samsung Internet and Edge also say "Chrome", and Chrome also says "Safari".

const BROWSERS: [RegExp, string][] = [
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Edg(?:e|A|iOS)?\//, "Edge"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Version\/[\d.]+.*Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Macintosh|Mac OS X/, "macOS"],
  [/Linux|X11/, "Linux"],
];

const match = (value: string, patterns: [RegExp, string][]) => patterns.find(([pattern]) => pattern.test(value))?.[1];

export function deviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device";
  const browser = match(userAgent, BROWSERS);
  const system = match(userAgent, SYSTEMS);
  if (!system) return browser ?? "Unknown device";
  return `${browser ?? "Browser"} on ${system}`;
}
