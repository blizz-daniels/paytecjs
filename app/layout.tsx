import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Da4lions Pay-tec",
    template: "%s | Da4lions Pay-tec",
  },
  description: "Da4lions Pay-tec migration shell for the Next.js App Router.",
  icons: {
    icon: [
      { url: "/assets/lion-logo-32.png", type: "image/png", sizes: "32x32" },
      { url: "/assets/lion-logo-16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: [{ url: "/assets/lion-logo-180.png", type: "image/png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
