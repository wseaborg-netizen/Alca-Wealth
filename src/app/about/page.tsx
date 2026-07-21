import type { Metadata } from "next";
import { MarketingPage, Section } from "../(marketing)/MarketingPage";
import { getServerAuthMode } from "@/lib/authServer";
import { isAuthed } from "@/lib/authView";

export const metadata: Metadata = {
  title: "About",
  description: "ALCA Wealth is advisor-facing software for investment research, fund comparison, de-identified portfolio analysis, and scenario modeling.",
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const authed = isAuthed(await getServerAuthMode());
  return (
    <MarketingPage
      authed={authed}
      title="About ALCA Wealth"
      lead="One connected workspace for the analytical side of advisory work — research funds, compare alternatives, review portfolios, and model scenarios.">
      <Section heading="What ALCA does">
        <p>
          ALCA Wealth brings four workflows that usually live in separate tools into one place:
          a classified fund universe with screening and comparison, full fund research profiles,
          portfolio construction and review, and deterministic scenario modeling with explicit,
          editable assumptions. Everything is built for the advisor&apos;s workflow — from first
          screen to a modeled recommendation.
        </p>
      </Section>
      <Section heading="How it treats data">
        <p>
          Market and fund data come from established financial data providers and are clearly
          labeled with their period and as-of date. Modeled projections are deterministic and
          assumption-driven — labeled illustrative, never presented as forecasts. Saved portfolios
          use de-identified names only; the platform is not designed to hold client personal data.
        </p>
      </Section>
      <Section heading="What ALCA is not">
        <p>
          ALCA Wealth is software. It does not provide investment advice or recommendations,
          does not execute trades, and does not custody assets. Advisors remain responsible for
          their own analysis and recommendations.
        </p>
      </Section>
    </MarketingPage>
  );
}
