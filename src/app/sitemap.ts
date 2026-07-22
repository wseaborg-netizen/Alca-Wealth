import type { MetadataRoute } from "next";
import { SITE_URL, PUBLIC_ROUTES } from "@/lib/site";

/** Public pages only — protected Research/Portfolio/Model/saved-work/API
    routes are intentionally excluded. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PUBLIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}` || SITE_URL,
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
