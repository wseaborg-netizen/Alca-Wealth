import type { Metadata } from "next";
import { MarketingPage, Section } from "../(marketing)/MarketingPage";
import { getServerAuthMode } from "@/lib/authServer";
import { isAuthed } from "@/lib/authView";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for the ALCA Wealth platform.",
  alternates: { canonical: "/terms" },
};

export default async function TermsPage() {
  const authed = isAuthed(await getServerAuthMode());
  return (
    <MarketingPage
      authed={authed}
      title="Terms"
      lead="Terms of use for the ALCA Wealth platform. This page summarizes key points; complete terms will be published here.">
      <Section heading="What ALCA Wealth is">
        <p>
          ALCA Wealth is research and analysis software for financial advisors. It is a tool for fund
          research, comparison, and documented review — it does not provide investment advice, and no
          regulatory status is claimed.
        </p>
      </Section>
      <Section heading="Acceptable use">
        <p>
          Access is limited to authorized users of a subscribing firm. You are responsible for
          maintaining the confidentiality of your credentials and for the accuracy of the information
          your firm enters.
        </p>
      </Section>
      <Section heading="No guarantee">
        <p>
          Figures shown in the app are for research and are not a recommendation. Past performance
          does not guarantee future results.
        </p>
      </Section>
    </MarketingPage>
  );
}
