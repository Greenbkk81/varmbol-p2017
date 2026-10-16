import type { Metadata, Viewport } from "next";
import {
  Barlow_Condensed,
  Chakra_Petch,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";

const chakra = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

export const metadata: Metadata = {
  title: "VÄRMBOLS FC P2017 · CM Tactical Match Engine",
  description:
    "Championship Manager-inspirerad speltids- och taktikapp (1-4-1) för Värmbols FC Pojkar 2017.",
  manifest: "/manifest.json",
  icons: {
    icon: "/club/varmbol-logo.png",
    apple: "/club/varmbol-logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#061224",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sv"
      className={`${chakra.variable} ${barlow.variable} ${jetbrains.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-[#050c18] text-[#e8f0fe]">
        {children}
      </body>
    </html>
  );
}
