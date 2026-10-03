"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { PauseIcon, PlayIcon } from "lucide-react";

import { Container } from "@/components/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import type { HeroSlide } from "@/lib/content";
import { cn } from "@/lib/utils";

const SLIDE_MS = 7000; // time on each slide
const REVEAL_MS = 1200; // image wipe (or fade, for reduced motion)
const COPY_DELAY_MS = 800; // ~2/3 through the wipe
const SWIPE_PX = 48;

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function usePageHidden() {
  return useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
}

/**
 * Full-bleed campaign carousel. Each slide's image crossfades over the previous one
 * (no dip to the background), and its copy rises in after the image starts.
 *
 * The active picker's progress bar is the timer: its CSS animation advances the slide
 * when it ends, so pausing the animation pauses the carousel. Autoplay pauses on mouse
 * hover, keyboard focus, a hidden tab, the pause button, and (by default) for
 * prefers-reduced-motion.
 */
export function HeroCarousel({
  slides,
  siteName,
  siteDescription,
}: {
  slides: HeroSlide[];
  siteName: string;
  siteDescription: string;
}) {
  const [active, setActive] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [userPaused, setUserPaused] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const pageHidden = usePageHidden();
  const swipeStart = useRef<number | null>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const direction = useRef<1 | -1>(1);

  // Reduced motion starts paused; the user can still press play.
  const paused = userPaused ?? reducedMotion;
  const running = !paused && !hovered && !focused && !pageHidden;

  const goTo = useCallback(
    (next: number) => {
      const target = (next + slides.length) % slides.length;
      if (target === active) return;
      direction.current = next > active ? 1 : -1;
      setPrevious(active);
      setActive(target);
    },
    [active, slides.length],
  );

  // Reveal the incoming slide over the previous one. A clip-path wipe in the direction of
  // travel avoids the double exposure of a crossfade; reduced motion gets a short fade.
  // WAAPI keeps it on the compositor and lets a newer reveal cancel an older one.
  useEffect(() => {
    if (previous === null) return;
    const element = slideRefs.current[active];
    if (!element) return;
    const keyframes = reducedMotion
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { clipPath: direction.current === 1 ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)" },
          { clipPath: "inset(0 0 0 0)" },
        ];
    const animation = element.animate(keyframes, {
      duration: reducedMotion ? 400 : REVEAL_MS,
      easing: "cubic-bezier(0.77, 0, 0.175, 1)",
    });
    animation.onfinish = () => setPrevious(null);
    return () => animation.cancel();
  }, [active, previous, reducedMotion]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured collections"
      className="relative h-[calc(100svh-var(--spacing-header))] max-h-[60rem] min-h-[36rem] touch-pan-y overflow-hidden bg-inverse"
      onFocus={(event) => event.target.matches(":focus-visible") && setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse") swipeStart.current = event.clientX;
      }}
      onPointerUp={(event) => {
        if (swipeStart.current === null) return;
        const distance = event.clientX - swipeStart.current;
        swipeStart.current = null;
        if (Math.abs(distance) > SWIPE_PX) goTo(active + (distance < 0 ? 1 : -1));
      }}
    >
      <h1 className="sr-only">
        {siteName}: {siteDescription}
      </h1>

      {/* Slides: images, stacked */}
      <div aria-live={running ? "off" : "polite"}>
        {slides.map((slide, index) => {
          const isActive = index === active;
          const isPrevious = index === previous;
          return (
            <div
              key={slide.id}
              ref={(element) => {
                slideRefs.current[index] = element;
              }}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${slides.length}: ${slide.label}`}
              aria-hidden={!isActive}
              className={cn(
                "absolute inset-0",
                // The outgoing slide stays visible underneath until the reveal finishes.
                isActive ? "z-20" : isPrevious ? "z-10" : "invisible z-0",
              )}
              style={
                {
                  "--focal-mobile": slide.focal.mobile,
                  "--focal-desktop": slide.focal.desktop,
                } as React.CSSProperties
              }
            >
              {/* Slow settle while the slide is on screen (decorative, so motion-safe only). */}
              <div
                className={cn(
                  "absolute inset-0 motion-safe:transition-transform motion-safe:ease-linear",
                  isActive
                    ? "scale-100 duration-[8000ms] motion-safe:starting:scale-[1.04]"
                    : "motion-safe:scale-[1.04] motion-safe:delay-[1200ms] motion-safe:duration-0", // reset once hidden
                )}
              >
                <Image
                  src={slide.image.src}
                  alt={slide.image.alt}
                  fill
                  sizes="100vw"
                  className="object-cover object-(--focal-mobile) md:object-(--focal-desktop)"
                  quality={60}
                  // Hidden slides are visibility:hidden, which lazy loading would skip; load them
                  // eagerly at low priority so they're ready before their first reveal.
                  loading="eager"
                  fetchPriority={index === 0 ? "high" : "low"}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="pointer-events-none absolute inset-0 z-30 bg-linear-to-t from-scrim/80 via-scrim/40 via-45% to-scrim/0 to-85% md:from-scrim/70 md:via-scrim/20 md:via-35% md:to-70%" />

      {/* Copy and controls */}
      <Container
        className="absolute inset-x-0 bottom-0 z-40 flex flex-col gap-8 pb-block text-on-image md:flex-row md:items-end md:justify-between"
        onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <div className="grid">
          {slides.map((slide, index) => {
            const isActive = index === active;
            // Copy follows the image: exits fast, then enters once the wipe has crossed the copy
            // (it sits bottom-left and forward wipes come from the right), staggered.
            const enter = (step: number) => ({
              transitionDelay: isActive ? `${COPY_DELAY_MS + step * 70}ms` : "0ms",
              transitionDuration: isActive ? "600ms" : "200ms",
            });
            const line = cn(
              "transition-[opacity,transform] ease-out-strong",
              isActive
                ? "translate-y-0 opacity-100 starting:opacity-0 motion-safe:starting:translate-y-2"
                : "opacity-0 motion-safe:translate-y-2",
            );
            return (
              <div
                key={slide.id}
                aria-hidden={!isActive}
                inert={!isActive}
                className="col-start-1 row-start-1 flex flex-col justify-end gap-6"
              >
                <h2 className={cn(line, "max-w-[13ch] text-display")} style={enter(0)}>
                  {slide.title}
                </h2>
                <p className={cn(line, "max-w-[40ch] text-title font-normal")} style={enter(1)}>
                  {slide.body}
                </p>
                <div className={line} style={enter(2)}>
                  <Link
                    href={slide.action.href}
                    className={cn(buttonVariants({ variant: "inverse" }), "focus-visible:outline-on-image")}
                  >
                    {slide.action.label}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-6"
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") goTo(active + 1);
              if (event.key === "ArrowLeft") goTo(active - 1);
            }}
          >
            {slides.map((slide, index) => {
              const isActive = index === active;
              return (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={`Show ${slide.label.toLowerCase()}`}
                  aria-current={isActive}
                  onClick={() => goTo(index)}
                  className={cn(
                    "group/picker flex w-24 flex-col gap-2 py-2 text-left eyebrow transition-opacity duration-200 focus-visible:outline-on-image",
                    isActive ? "opacity-100" : "opacity-75 hover:opacity-100",
                  )}
                >
                  {slide.label}
                  <span className="relative h-px w-full overflow-hidden bg-on-image/30">
                    {isActive && (
                      <span
                        key={`${active}-${slide.id}`}
                        className="absolute inset-0 origin-left animate-progress bg-on-image"
                        style={{
                          animationDuration: `${SLIDE_MS}ms`,
                          animationPlayState: running ? "running" : "paused",
                        }}
                        onAnimationEnd={() => goTo(active + 1)}
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <Button
            variant="overlay"
            size="icon"
            onClick={() => setUserPaused(!paused)}
            aria-label={paused ? "Play slideshow" : "Pause slideshow"}
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
          </Button>
        </div>
      </Container>
    </section>
  );
}
