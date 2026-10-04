// Stands in for the `server-only` package in tests (aliased in vitest.config.mts): the real one
// throws when imported outside React Server Components, which would block testing server modules.
export {};
