import type { Metadata } from "next";
import "./globals.css";
import {
  SITE_URL, SITE_NAME, SITE_TITLE, SITE_DESCRIPTION,
  organizationJsonLd, softwareApplicationJsonLd,
} from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s — ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: "/og/alca-og.png", width: 1200, height: 630, alt: "ALCA Wealth — Research. Review. Monitor." }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og/alca-og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Structured data — software-focused only; no advice or regulatory claims. */}
        <script type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }} />
        <script type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd()) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
