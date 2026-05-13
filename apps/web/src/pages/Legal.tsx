import { Link } from "react-router-dom";
import { Card, PageHeader } from "../components/ui";
import { CURRENT_TERMS_VERSION } from "@chorechamps/shared";

const EFFECTIVE_DATE = "2026-05-13";

function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <PageHeader
          title={title}
          subtitle={`Effective ${EFFECTIVE_DATE} · Version ${CURRENT_TERMS_VERSION}`}
        />
        <Card className="prose prose-slate max-w-none text-sm">
          {children}
          <div className="border-t border-slate-200 mt-6 pt-4 text-xs text-slate-500">
            <Link to="/" className="text-brand-600 hover:underline">
              ← Back to home
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function TermsOfService() {
  return (
    <LegalShell title="Terms of Service">
      <p>
        Welcome to ChoreChamps. By creating an account you agree to these terms. Plain-language summary — read
        the rest before you accept.
      </p>
      <h3>1. Who can use it</h3>
      <p>
        ChoreChamps is intended for use by parents and guardians on behalf of their families. A parent or
        legal guardian creates the family account and is responsible for all activity within it, including kid
        profiles they create.
      </p>
      <h3>2. Account responsibility</h3>
      <p>
        You must provide accurate information, keep your password secure, and notify us of any unauthorized
        access. We may suspend accounts that violate these terms.
      </p>
      <h3>3. Acceptable use</h3>
      <p>
        Do not use the service for anything illegal, harmful to minors, or that infringes others' rights. No
        automated scraping, no reverse engineering, no resale.
      </p>
      <h3>4. Content</h3>
      <p>
        You retain ownership of content you upload (task photos, names, notes). You grant us a limited license
        to store and display that content solely to operate the service for your family.
      </p>
      <h3>5. Termination</h3>
      <p>
        You may delete your account at any time from Settings. We may terminate accounts for violations of
        these terms with reasonable notice when possible.
      </p>
      <h3>6. Warranty &amp; liability</h3>
      <p>
        The service is provided as-is, without warranty. To the maximum extent permitted by law, our liability
        is limited to the fees you have paid us in the prior 12 months (currently $0 for the free tier).
      </p>
      <h3>7. Changes</h3>
      <p>
        We may update these terms. Material changes will require you to re-accept on next sign-in (version
        pin: {CURRENT_TERMS_VERSION}).
      </p>
      <h3>8. Contact</h3>
      <p>For questions: support@chorechamps.app (placeholder).</p>
    </LegalShell>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        We collect only what's needed to run a family chore tracker. We don't sell your data and we don't run
        ads.
      </p>
      <h3>1. What we collect</h3>
      <ul>
        <li>Account: email, name, password hash.</li>
        <li>Family content: kid names, avatars, tasks, completions, rewards, ledger entries.</li>
        <li>
          Optional: photos kids submit as proof. These are retained per your family setting (default 90 days)
          and then automatically deleted.
        </li>
        <li>Technical: standard request logs (IP, user-agent) for security and debugging.</li>
      </ul>
      <h3>2. Children's data</h3>
      <p>
        Kid profiles are created and managed by a parent. We do not require email or password from kids
        themselves; they sign in with a PIN their parent sets. We do not knowingly collect personal
        information directly from children under 13 outside of what their parent provides.
      </p>
      <h3>3. How we use data</h3>
      <p>To run the service. That's it. No advertising. No third-party data sharing for marketing.</p>
      <h3>4. Sharing</h3>
      <p>
        We use service providers (database hosting, email delivery) under standard data processing agreements.
        We don't share data with anyone else unless required by law.
      </p>
      <h3>5. Your rights</h3>
      <ul>
        <li>Export: download a copy of your family's data from Settings → Data export.</li>
        <li>
          Delete: permanently delete your family and all associated data from Settings → Delete account.
        </li>
        <li>Correct: edit any field from inside the app at any time.</li>
      </ul>
      <h3>6. Retention</h3>
      <p>
        Most data is retained until you delete your account. Photo proofs auto-purge after the
        family-configured retention period (default 90 days). Backups roll forward on a 30-day window.
      </p>
      <h3>7. Security</h3>
      <p>
        Passwords are bcrypt-hashed. Tokens are short-lived and rotated. We use TLS in transit. No security is
        perfect — please report concerns to security@chorechamps.app.
      </p>
      <h3>8. Changes</h3>
      <p>Material changes require re-acceptance (version pin: {CURRENT_TERMS_VERSION}).</p>
    </LegalShell>
  );
}
