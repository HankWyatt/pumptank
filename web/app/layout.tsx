import "./globals.css";
import type { Metadata } from "next";
import { Fraunces, Space_Mono, Archivo } from "next/font/google";
import { SiteFooter } from "@/components/SiteFooter";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "900"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const mono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});

const body = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  // TODO: real domain
  metadataBase: new URL(process.env.SITE_URL ?? "https://pumptank.fun"),
  title: "PUMPTANK",
  description: "Tribute tokens for Shark Tank pitches that got no deal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} ${body.variable}`}>
      <body>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
