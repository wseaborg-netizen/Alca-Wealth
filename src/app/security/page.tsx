import type { Metadata } from "next";
import { MarketingPage, Section } from "../(marketing)/MarketingPage";
import { getServerAuthMode } from "@/lib/authServer";
import { isAuthed } from "@/lib/authView";

export const metadata: Metadata = {
  title: "Security",
  description: "How ALCA Wealth protects accounts and saved work: authenticated access, row-level security, server-side authorization, and a no-client-PII design.",
  alternates: { canonical: "/security" },
};

export default async function SecurityPage() {
  const authed = isAuthed(await getServerAuthMode());
  return (
    <MarketingPage
      authed={authed}
      title="Security"
      lead="The platform is private by default: the app sits behind authentication, and saved work is isolated per workspace at the database layer.">
      <Section heading="Account and access">
        <p>
          Every workspace sits behind authenticated sign-in. Sessions are managed server-side in
          httpOnly cookies — credentials and tokens are never stored in browser-accessible storage.
          Public pages like this one contain no user data.
        </p>
      </Section>
      <Section heading="Data isolation">
        <p>
          Saved watchlists, comparisons, portfolios, and model scenarios are scoped to your
          workspace and enforced with database row-level security — authorization happens at the
          data layer, not just in the interface. Administrative credentials never reach the browser.
        </p>
      </Section>
      <Section heading="De-identified by design">
        <p>
          ALCA Wealth is built to work without client personal information. Saved portfolios use
          anonymous labels; the platform does not store client names, account numbers, government
          IDs, custodian credentials, statements, or tax documents.
        </p>
      </Section>
      <Section heading="Auditability">
        <p>
          Create, update, and delete actions on saved work are recorded in an audit log scoped to
          your workspace.
        </p>
      </Section>
    </MarketingPage>
  );
}
