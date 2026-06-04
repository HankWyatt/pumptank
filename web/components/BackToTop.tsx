/* Fitts's + Jakob's Law: a familiar, always-reachable return on long pages.
   Appears after scrolling; respects prefers-reduced-motion via CSS scroll-behavior. */
"use client";
import { useEffect, useState } from "react";

export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0 })}
      className={`totop ${show ? "show" : ""}`}
    >
      ↑
    </button>
  );
}
