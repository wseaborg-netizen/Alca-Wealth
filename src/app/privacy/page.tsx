import type { Metadata } from "next";
import { MarketingPage, Section } from "../(marketing)/MarketingPage";
import { getServerAuthMode } from "@/lib/authServer";
import { isAuthed } from "@/lib/authView";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How ALCA Wealth handles data.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage() {
  const authed = isAuthed(await getServerAuthMode());
  return (
    <MarketingPage
      authed={authed}
      title="Privacy"
      lead="How ALCA Wealth handles the data in your workspace. This page summarizes our approach; a complete policy will be published here.">
      <Section heading="Data scope">
        <p>
          ALCA Wealth is software used by advisory firms. Data you enter — your firm&apos;s fund
          inventory, reviews, and saved lists — is scoped to your firm and is only accessible through
          authenticated sessions. The application does not expose one firm&apos;s data to another.
        </p>
      </Section>
      <Section heading="Market data">
        <p>
          Fund prices and history come from a third-party market-data provider and are used only to
          display the figures shown in the app. ALCA Wealth does not sell your data.
        </p>
      </Section>
      <Section heading="Contact">
        <p>
          Questions about data handling? Reach us at{" "}
          <a href="mailto:wseaborg@iu.edu" style={{ color: "#5EEAD4" }}>wseaborg@iu.edu</a>. Never send
          passwords or client information by email.
        </p>
      </Section>
    </MarketingPage>
  );
}
