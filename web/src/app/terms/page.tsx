import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LEGAL_CONTACT } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service — Hookdash",
  description: "The rules for using Hookdash.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="14 October 2026">
      <section>
        <p>
          These terms cover your use of Hookdash at{" "}
          <a href="https://hookdash.ojusentinel.com">hookdash.ojusentinel.com</a> and its API, run as an
          independent project by Joseph Olayanju. By creating an account or sending webhooks to Hookdash, you
          agree to them. Our <Link href="/privacy">Privacy Policy</Link> explains how we handle data.
        </p>
      </section>

      <section>
        <h2>The service</h2>
        <p>
          Hookdash receives webhooks on your ingress URLs, stores them so you can inspect and replay them, and
          forwards them to destinations you choose. It is provided free of charge, as is, without uptime
          guarantees or an SLA. Features may change or be removed.
        </p>
      </section>

      <section>
        <h2>Your account</h2>
        <p>
          Keep your sign-in details and API keys secure; you are responsible for activity on your account and
          workspaces. You must be old enough to form a binding contract where you live.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>Don&apos;t use Hookdash for anything illegal, or to send spam or malware.</li>
          <li>
            Don&apos;t point forwarding at systems you don&apos;t own or have permission to use, or use Hookdash to
            probe, flood or attack anyone.
          </li>
          <li>Don&apos;t try to reach other users&apos; data or get around rate limits and security controls.</li>
          <li>Don&apos;t send full card numbers, passwords or other highly sensitive personal data through it.</li>
        </ul>
        <p className="mt-4">We may suspend accounts or block traffic that breaks these rules or puts the service at risk.</p>
      </section>

      <section>
        <h2>Your data</h2>
        <p>
          You keep ownership of everything you send to Hookdash. You give us permission to store, process and
          forward it only as needed to run the service for you. You are responsible for having the right to send
          that data to us and to the destinations you configure.
        </p>
      </section>

      <section>
        <h2>Open source</h2>
        <p>
          Hookdash&apos;s source code is available under the MIT License at{" "}
          <a href="https://github.com/Olayanju-1234/hooklens">github.com/Olayanju-1234/hooklens</a>. These terms
          cover the hosted service, not your use of the code.
        </p>
      </section>

      <section>
        <h2>Liability</h2>
        <p>
          To the extent the law allows, Hookdash is provided without warranties of any kind, and we are not liable
          for indirect or consequential losses, lost webhooks, lost profits or lost data arising from your use of
          the service.
        </p>
      </section>

      <section>
        <h2>Ending your use</h2>
        <p>
          You can stop using Hookdash at any time and ask us to delete your account by emailing{" "}
          <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>. We may end the service or your access with
          reasonable notice, or immediately for abuse.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          We may update these terms. The date above shows the latest version, and continuing to use Hookdash after
          a change means you accept it. Questions go to <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
