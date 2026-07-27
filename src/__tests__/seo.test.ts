/**
 * SEO foundation checks: robots + sitemap expose ONLY public marketing pages,
 * metadata is driven by the production site URL, and no protected app or API
 * route can leak into the index.
 */
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { SITE_URL, SITE_TITLE, SITE_DESCRIPTION, PUBLIC_ROUTES, organizationJsonLd, softwareApplicationJsonLd } from "@/lib/site";

const PROTECTED_FRAGMENTS = [
  "/api", "/dashboard", "/workspace", "/research", "/portfolio", "/model",
  "/watchlist", "/saved", "/account", "/settings",
];

describe("robots.txt", () => {
  const r = robots();
  const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;

  test("renders with a wildcard rule and sitemap directive", () => {
    expect(rule.userAgent).toBe("*");
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  test("allows the public pages", () => {
    for (const p of PUBLIC_ROUTES) expect(rule.allow).toContain(p);
  });

  test("disallows API and app areas", () => {
    expect(rule.disallow).toContain("/api/");
    for (const p of ["/dashboard", "/model", "/portfolio", "/watchlist", "/saved"]) {
      expect(rule.disallow).toContain(p);
    }
  });
});

describe("sitemap.xml", () => {
  const entries = sitemap();

  test("contains exactly the public routes", () => {
    const urls = entries.map((e) => e.url);
    expect(urls).toHaveLength(PUBLIC_ROUTES.length);
    expect(urls).toContain(SITE_URL);                 // homepage
    expect(urls).toContain(`${SITE_URL}/login`);
    expect(urls).toContain(`${SITE_URL}/signup`);
    expect(urls).toContain(`${SITE_URL}/about`);
    expect(urls).toContain(`${SITE_URL}/contact`);
    expect(urls).toContain(`${SITE_URL}/security`);
  });

  test("excludes protected app, saved-work, and API routes", () => {
    for (const e of entries) {
      const path = e.url.replace(SITE_URL, "") || "/";
      for (const frag of PROTECTED_FRAGMENTS) {
        expect(path.startsWith(frag)).toBe(false);
      }
    }
  });

  test("every URL uses the production site origin", () => {
    for (const e of entries) expect(e.url.startsWith(SITE_URL)).toBe(true);
  });
});

describe("site metadata", () => {
  test("title/description match the approved positioning", () => {
    expect(SITE_TITLE).toBe("ALCA Wealth | Fund Oversight and Review for Advisory Firms");
    expect(SITE_DESCRIPTION).toMatch(/advisory firms/);
    expect(SITE_DESCRIPTION).toMatch(/documented review process/);
  });

  test("site URL is a valid absolute origin with no trailing slash", () => {
    expect(SITE_URL).toMatch(/^https:\/\/[^/]+$/);
  });

  test("structured data makes no advice or regulatory claims", () => {
    const blob = JSON.stringify([organizationJsonLd(), softwareApplicationJsonLd()]).toLowerCase();
    for (const banned of ["investment advice", "registered investment", "broker-dealer", "guaranteed", "sec-registered"]) {
      // "does not provide investment advice" is the one allowed mention
      if (banned === "investment advice") {
        expect(blob).toContain("does not provide investment advice");
        continue;
      }
      expect(blob).not.toContain(banned);
    }
    expect(blob).toContain('"@type":"organization"');
    expect(blob).toContain('"@type":"softwareapplication"');
  });
});
