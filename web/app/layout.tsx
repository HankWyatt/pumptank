import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "PUMPTANK", description: "Tribute tokens for Shark Tank pitches that got no deal." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
