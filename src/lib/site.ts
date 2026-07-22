/**
 * Public site config — single source for the canonical origin used in
 * metadata, sitemap, robots, and structured data. Set NEXT_PUBLIC_SITE_URL
 * when the custom production domain lands; the Vercel URL is the fallback.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://alcawealth.vercel.app").replace(/\/+$/, "");

export const SITE_NAME = "ALCA Wealth";

export const SITE_TITLE = "ALCA Wealth | Investment Research and Portfolio Modeling for Advisors";

export const SITE_DESCRIPTION =
  "ALCA Wealth helps financial advisors research funds, compare alternatives, review de-identified portfolios, and model investment scenarios in one connected workspace.";

/** Public, indexable routes — the ONLY paths that belong in the sitemap.
    Protected app areas live behind login inside the SPA and must never be added. */
export const PUBLIC_ROUTES = ["/", "/login", "/signup", "/about", "/contact", "/security"] as const;

/** Structured data. Software-focused language only: ALCA is a research and
    modeling tool for advisors — it does not provide investment advice and no
    regulatory status is claimed. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/og/alca-og.png`,
    description: SITE_DESCRIPTION,
  };
}

export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    description:
      "Advisor-facing software for investment research, fund comparison, de-identified portfolio analysis, and deterministic scenario modeling. ALCA Wealth is a research and analysis tool; it does not provide investment advice.",
    audience: { "@type": "BusinessAudience", audienceType: "Financial advisors" },
  };
}
