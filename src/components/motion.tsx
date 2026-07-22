"use client";
import React, { useEffect, useRef, useState } from "react";

// ── Motion primitives ────────────────────────────────────────────────────────
// Dependency-free (IntersectionObserver + requestAnimationFrame). Every effect
// checks prefers-reduced-motion and degrades to an instant, final state so no
// animation ever delays a meaningful action or fights accessibility settings.

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // The Settings motion preference (<html data-motion="reduced"|"full">)
    // overrides the OS setting; "system" (no attribute) follows the OS.
    const compute = () => {
      const attr = document.documentElement.getAttribute("data-motion");
      setReduced(attr === "reduced" || (mq.matches && attr !== "full"));
    };
    compute();
    mq.addEventListener?.("change", compute);
    const mo = new MutationObserver(compute);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    return () => { mq.removeEventListener?.("change", compute); mo.disconnect(); };
  }, []);
  return reduced;
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    setMatch(mq.matches);
    const on = () => setMatch(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return match;
}

/** Fires once (by default) when the element scrolls into view. */
export function useInView<T extends HTMLElement = HTMLDivElement>(
  opts: { once?: boolean; margin?: string; threshold?: number } = {},
): [React.RefObject<T | null>, boolean] {
  const { once = true, margin = "0px 0px -12% 0px", threshold = 0.12 } = opts;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { setInView(true); if (once) io.disconnect(); }
          else if (!once) setInView(false);
        });
      },
      { rootMargin: margin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, margin, threshold]);
  return [ref, inView];
}

/** Fade + translate a block in. Pure CSS animation — content is never held
    invisible waiting on JavaScript, so the page stays readable even if
    hydration is delayed or a stale document loads mismatched chunks.
    Reduced motion: the global CSS rule collapses the animation to its final
    (visible) state instantly. `once` kept for signature compatibility. */
export function Reveal({
  children, delay = 0, y = 18, once: _once = true, style, as = "div",
}: {
  children: React.ReactNode; delay?: number; y?: number; once?: boolean;
  style?: React.CSSProperties; as?: "div" | "span" | "section";
}) {
  const Tag = as as "div";
  return (
    <Tag
      style={{
        ["--rv-y" as never]: `${y}px`,
        animation: `alca-reveal 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms both`,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

/** Counts from 0 → value when scrolled into view, then holds. */
export function CountUp({
  value, decimals = 0, duration = 1500, prefix = "", suffix = "", style,
}: {
  value: number; decimals?: number; duration?: number;
  prefix?: string; suffix?: string; style?: React.CSSProperties;
}) {
  const [ref, inView] = useInView<HTMLSpanElement>();
  const reduced = usePrefersReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduced) { setN(value); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, reduced]);
  const text = n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span ref={ref} style={style}>{prefix}{text}{suffix}</span>;
}
