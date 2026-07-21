import type { Metadata } from "next";
import { MarketingPage, Section } from "../(marketing)/MarketingPage";
import { getServerAuthMode } from "@/lib/authServer";
import { isAuthed } from "@/lib/authView";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the ALCA Wealth team.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const authed = isAuthed(await getServerAuthMode());
  return (
    <MarketingPage
      authed={authed}
      title="Contact"
      lead="Questions about the platform, data coverage, or getting your team set up — reach out directly.">
      <Section heading="Email">
        <p>
          <a href="mailto:wseaborg@iu.edu" style={{ color: "#5EEAD4" }}>wseaborg@iu.edu</a>
        </p>
        <p style={{ marginTop: 10 }}>
          We read everything. For account or access issues, include the email address on your
          ALCA account (never send passwords or client information).
        </p>
      </Section>
    </MarketingPage>
  );
}
