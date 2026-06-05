import "./globals.css";
import type { Metadata } from "next";
import { Anton, Archivo, IBM_Plex_Mono } from "next/font/google";
import { SiteMasthead } from "@/components/SiteMasthead";
import { SiteFooter } from "@/components/SiteFooter";
import { BackToTop } from "@/components/BackToTop";

// Deep-Water Edition: Anton (heavy condensed display), single weight, no italic.
const display = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
  fallback: ["Archivo", "system-ui", "sans-serif"],
  adjustFontFallback: false,
});

const body = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  variable: "--font-body",
  display: "swap",
  fallback: ["system-ui", "Helvetica Neue", "Arial", "sans-serif"],
  adjustFontFallback: false,
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  // TODO: real domain
  metadataBase: new URL(process.env.SITE_URL ?? "https://pumptank.fun"),
  title: "PUMPTANK · The Tribute Ledger",
  description: "Tribute tokens for Shark Tank pitches — deal or no deal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} ${body.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <SiteMasthead />
        <div id="main">{children}</div>
        <SiteFooter />
        <BackToTop />
      </body>
    </html>
  );
}
