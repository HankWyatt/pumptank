import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: { colors: { bg: "#0B2027", accent: "#33D6B1", fin: "#102E36", muted: "#8CA1A6", "fin-2": "#0D262D", "accent-dim": "#1F9E84", ink: "#F0F5F6" } } },
  plugins: [],
} satisfies Config;
