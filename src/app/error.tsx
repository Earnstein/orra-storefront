"use client";

import { useEffect } from "react";

/**
 * Errors thrown by a layout (the storefront's or the admin's), which their own error.tsx files
 * can't catch: the storefront's message, without the header and footer. Plain elements with the
 * same classes, not the storefront's components: this boundary is loaded with the root layout on
 * every page, and sharing Base UI's Button and the primitives with the storefront's layout made
 * Turbopack ship copies of them twice (about 10 KB on every page; src/app/root-error.test.ts).
 */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="flex flex-1 flex-col">
      <section className="flex min-h-[60svh] w-full items-center border-b border-inverse-foreground/20 bg-inverse py-section text-inverse-foreground [--ring:var(--inverse-foreground)]">
        <div className="mx-auto flex w-full max-w-content flex-col items-center gap-block px-gutter text-center">
          <div className="flex flex-col items-center gap-4">
            <p className="eyebrow text-inverse-foreground/60">Error</p>
            <h1 className="text-display">Something went wrong</h1>
            <p className="max-w-prose text-inverse-foreground/70">Please try again. If it keeps happening, come back a little later.</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <button
              type="button"
              onClick={() => retry()}
              className="eyebrow inline-flex h-12 items-center justify-center border border-transparent bg-background px-8 text-foreground transition-colors duration-200 hover:bg-background/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Try again
            </button>
            {/* A full load on purpose: the layout that failed renders afresh, and no Link is imported. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="link eyebrow">
              Back to the homepage
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
