import type { Metadata } from "next";
import { MarketingPage, Section } from "../(marketing)/MarketingPage";
import { getServerAuthMode } from "@/lib/authServer";
import { isAuthed } from "@/lib/authView";

export const metadata: Metadata = {
  title: "Disclosures",
  description: "Important disclosures about ALCA Wealth.",
  alternates: { canonical: "/disclosures" },
};

export default async function DisclosuresPage() {
  const authed = isAuthed(await getServerAuthMode());
  return (
    <MarketingPage
      authed={authed}
      title="Disclosures"
      lead="Important information about how ALCA Wealth presents fund data.">
      <Section heading="Not investment advice">
        <p>
          ALCA Wealth is a research and analysis tool for financial advisors. It does not provide
          investment advice, and no regulatory status is claimed. Figures shown are for research and
          are not a recommendation to buy or sell any security.
        </p>
      </Section>
      <Section heading="How performance is shown">
        <p>
          The primary performance figure across the app is <strong>price change</strong>: for ETFs the
          raw closing price (split-adjusted, dividends excluded); for mutual funds the raw NAV
          (distributions excluded), computed as ending price divided by starting price, minus one. It
          is not total return, and it is not annualized. Where history is insufficient, the figure is
          shown as Unavailable rather than zero.
        </p>
      </Section>
      <Section heading="Past performance">
        <p>Past performance does not guarantee future results.</p>
      </Section>
    </MarketingPage>
  );
}
