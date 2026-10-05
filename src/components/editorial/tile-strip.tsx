"use client";

/**
 * The category tiles' container. On phones it scrolls sideways, and browsers don't scroll a
 * partly visible tile into view when it takes keyboard focus, so this does.
 */
export function TileStrip(props: React.ComponentProps<"div">) {
  return (
    <div
      {...props}
      onFocus={(event) => {
        if (!event.target.matches(":focus-visible")) return;
        const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        event.target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: smooth ? "smooth" : "auto" });
      }}
    />
  );
}
