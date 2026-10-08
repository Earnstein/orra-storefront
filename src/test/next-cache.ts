// Vitest stand-in for "next/cache" (aliased in vitest.config.mts). The real cacheTag/cacheLife
// only work inside a Next.js render with cacheComponents on; in tests the "use cache" directive
// is an inert string, so catalogue reads run uncached against PGlite and these calls do nothing.
// Type-checking still uses Next's real signatures.
export function cacheTag(): void {}
export function cacheLife(): void {}
export function revalidateTag(): void {}
export function updateTag(): void {}
export function refresh(): void {}
