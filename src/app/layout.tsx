import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIDLINJEN · CM Tactical Match Engine",
  description:
    "Championship Manager-inspirerad speltids- och taktikapp för ungdomsfotboll.",
  manifest: "/manifest.json",
  robots: {
    index: false,
    follow: false,
  },
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
    <html lang="sv" className="h-full antialiased dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Chakra+Petch:wght@500;600;700&family=JetBrains+Mono:wght@500;700;800&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#050c18] text-[#e8f0fe]">
        {children}
      </body>
    </html>
  );
}
