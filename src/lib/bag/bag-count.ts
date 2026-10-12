// The header's bag count, read from the readable `orra_bag_count` cookie the server sets with every
// bag change, so no page view needs a request. Client-safe (no server imports).

const NAME = "orra_bag_count";

/** The count from a Cookie header or `document.cookie`; anything but a whole number 0–999 reads as 0. */
export function parseBagCount(cookie: string): number {
  for (const part of cookie.split(";")) {
    const [name, value] = part.trim().split("=");
    if (name !== NAME) continue;
    return /^\d{1,3}$/.test(value ?? "") ? Number(value) : 0;
  }
  return 0;
}

/** Clears the count on sign-out (the account's bag stays in the account). */
export function clearBagCount() {
  document.cookie = `${NAME}=0; path=/; max-age=0; samesite=lax`;
}
