import type { Metadata, Viewport } from "next";
// @ts-ignore: CSS import type declarations are handled by Next.js
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "קוגומלו - ניהול חוגים",
  description: "מערכת ניהול חוגים לסניפי פעילות לילדים",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [
      { rel: "manifest-icon-192", url: "/android-chrome-192x192.png" },
      { rel: "manifest-icon-512", url: "/android-chrome-512x512.png" },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

