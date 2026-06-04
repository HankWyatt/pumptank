import type { Config } from "tailwindcss";

/* Colours bind to the CSS variables in globals.css so Tailwind utilities
   (text-ink, bg-navy, border-…) flip with the theme instead of pinning the
   old light hexes. Names kept stable for existing call sites. */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--paper)",
        paper: "var(--paper)",
        "paper-2": "var(--paper-2)",
        "paper-3": "var(--paper-3)",
        navy: "var(--navy)",
        "navy-2": "var(--navy-2)",
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        muted: "var(--muted)",
        accent: "var(--teal)",
        "accent-dim": "var(--teal-2)",
        teal: "var(--teal)",
        "teal-2": "var(--teal-2)",
        blue: "var(--blue)",
        fin: "var(--paper-2)",
        "fin-2": "var(--paper-3)",
        reject: "var(--red)",
        red: "var(--red)",
      },
    },
  },
  plugins: [],
} satisfies Config;
