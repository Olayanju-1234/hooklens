import type { Metadata } from "next";
import { LegalPage, LEGAL_CONTACT } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy — Hookdash",
  description: "What Hookdash collects, why, and how long it keeps it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="14 October 2026">
      <section>
        <p>
          Hookdash is a webhook inspection and forwarding tool run as an independent project by Joseph
          Olayanju. This page explains what data Hookdash handles when you use{" "}
          <a href="https://hookdash.ojusentinel.com">hookdash.ojusentinel.com</a> and its API, and what you can
          do about it. Questions go to <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
        </p>
      </section>

      <section>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account details:</strong> your email address, and either a hashed password or the email address
            Google or GitHub shares when you sign in with them. We never see your Google or GitHub password. If you
            add an avatar URL, we store that too.
          </li>
          <li>
            <strong>Workspace data you create:</strong> endpoints, forwarding destinations, transform rules, alert
            channels (including the Slack or Discord webhook URLs you enter), workspace members and invites. API keys
            are stored only as hashes.
          </li>
          <li>
            <strong>Webhooks you send to your ingress URL:</strong> request headers, body, source IP address, and
            the results of forwarding them to your destinations.
          </li>
          <li>
            <strong>Operational logs:</strong> IP addresses, timestamps and errors, kept to run, secure and debug
            the service.
          </li>
        </ul>
      </section>

      <section>
        <h2>How we use it</h2>
        <p>
          Only to provide Hookdash: capturing, displaying, replaying and forwarding your webhooks; signing you in;
          sending transactional email (email verification, password resets, workspace invites and the alerts you
          configure); and keeping the service secure. We do not sell your data, show ads, or use third-party
          analytics or tracking.
        </p>
      </section>

      <section>
        <h2>Who else processes it</h2>
        <ul>
          <li><strong>Oracle Cloud</strong> hosts the servers and database.</li>
          <li><strong>Resend</strong> delivers our emails.</li>
          <li><strong>Google and GitHub</strong>, only if you choose to sign in with them.</li>
          <li><strong>Your own destinations:</strong> webhooks are forwarded to the URLs you configure.</li>
        </ul>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          Hookdash sets three first-party cookies: your sign-in token, your ingress slug and your selected
          workspace. They exist only to keep you signed in. There are no advertising or tracking cookies.
        </p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <p>
          Webhook events are deleted automatically after your workspace&apos;s retention period (30 days unless
          you change it). Deleting a workspace removes its data. Account details are kept until you ask us to
          delete your account.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          You can view and delete your webhook data in the dashboard at any time. To get a copy of your account
          data or have your account deleted, email <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> and
          we&apos;ll handle it within 30 days.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          Traffic is encrypted with HTTPS, passwords and API keys are hashed, and access to workspace data is
          limited to its members. No system is perfectly secure, so please don&apos;t send card numbers or other
          highly sensitive data through Hookdash.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          If this policy changes, we&apos;ll update this page and the date above. Material changes will be
          announced by email to account holders.
        </p>
      </section>
    </LegalPage>
  );
}
