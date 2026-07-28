import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Crawl policy: public marketing pages only. The authenticated app lives
    behind login inside the SPA; APIs and any app-area paths are disallowed. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/signup", "/about", "/contact", "/security", "/privacy", "/terms", "/disclosures"],
        disallow: [
          "/api/",
          // Defensive: app/workspace areas (SPA tabs today, real routes later).
          "/dashboard", "/workspace", "/research", "/portfolio", "/model",
          "/watchlist", "/saved", "/account", "/settings",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
