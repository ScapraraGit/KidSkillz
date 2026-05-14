import { Link } from "react-router-dom";
import { Card, PageHeader } from "../components/ui";
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from "@chorechampz/shared";

const EFFECTIVE_DATE = "2026-05-13";
const COMPANY_NAME = "ChoreChampz, Inc.";
const CONTACT_EMAIL = "legal@chorechampz.com";
const PRIVACY_EMAIL = "privacy@chorechampz.com";
const SECURITY_EMAIL = "security@chorechampz.com";
const TRUST_EMAIL = "trust@chorechampz.com";
const DMCA_EMAIL = "dmca@chorechampz.com";

function LegalShell({
  title,
  version,
  children,
}: {
  title: string;
  version?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <PageHeader
          title={title}
          subtitle={`Effective ${EFFECTIVE_DATE}${version != null ? ` · Version ${version}` : ""}`}
        />
        <Card className="prose prose-slate max-w-none text-sm leading-relaxed">
          {children}
          <div className="border-t border-slate-200 mt-6 pt-4 text-xs text-slate-500 flex gap-3 flex-wrap">
            <Link to="/" className="text-brand-600 hover:underline">
              ← Home
            </Link>
            <Link to="/terms" className="text-brand-600 hover:underline">
              Terms
            </Link>
            <Link to="/privacy" className="text-brand-600 hover:underline">
              Privacy
            </Link>
            <Link to="/acceptable-use" className="text-brand-600 hover:underline">
              Acceptable Use
            </Link>
            <Link to="/child-safety" className="text-brand-600 hover:underline">
              Child Safety
            </Link>
            <Link to="/dmca" className="text-brand-600 hover:underline">
              DMCA
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function TermsOfService() {
  return (
    <LegalShell title="Terms of Service" version={CURRENT_TERMS_VERSION}>
      <p className="text-xs uppercase tracking-wide text-slate-500">
        {COMPANY_NAME} · Effective {EFFECTIVE_DATE}
      </p>
      <p>
        These Terms of Service ("<strong>Terms</strong>") form a binding legal agreement between you and{" "}
        {COMPANY_NAME} ("<strong>Company</strong>," "<strong>we</strong>," "<strong>us</strong>," or "
        <strong>our</strong>") governing your access to and use of the ChoreChampz service, including the
        Platform and any related websites, mobile applications, APIs, and content (collectively, the "
        <strong>Service</strong>").
      </p>

      <h3>1. Acceptance of Terms</h3>
      <p>
        By creating an account, accessing, downloading, installing, or otherwise using the Service, you
        acknowledge that you have read these Terms, the <Link to="/privacy">Privacy Policy</Link>, the{" "}
        <Link to="/acceptable-use">Acceptable Use Policy</Link>, the{" "}
        <Link to="/child-safety">Child Safety &amp; Moderation Policy</Link>, and any other policies
        incorporated herein by reference, and you accept and agree to be bound by them. If you do not agree,
        do not access or use the Service. Continued use following any modification constitutes acceptance of
        the modified Terms.
      </p>

      <h3>2. Eligibility and Parent-Controlled Accounts</h3>
      <p>
        The Service is intended solely for adults aged eighteen (18) or older who are the parent, legal
        guardian, or other adult with lawful custodial authority over the minors who will be added to the
        household account ("<strong>Parent</strong>" or "<strong>Account Owner</strong>"). By registering,
        you represent and warrant that you (a) are at least 18; (b) have full legal capacity to contract;
        (c) are the parent, legal guardian, or otherwise legally authorized adult for every minor whose
        profile you create; (d) have not been previously suspended from the Service; (e) will use the
        Service in compliance with applicable law; and (f) the registration information you provide is
        accurate, current, and complete.
      </p>

      <h3>3. Authorized Child Users / Minor Sub-Profiles</h3>
      <p>
        Children and teens are not legal account holders. The Service permits the Account Owner to create
        authorized sub-profiles ("<strong>Child Profiles</strong>") for minors within the household under
        the Account Owner's direct supervision. The Account Owner expressly acknowledges and agrees that
        (a) the Account Owner authorizes each Child Profile and assumes legal responsibility for it; (b) the
        Account Owner has obtained any required consent (including from co-parents or co-guardians) before
        creating a Child Profile; (c) the Account Owner is responsible for determining the
        age-appropriateness of all features, tasks, rewards, and uploads associated with each Child Profile;
        (d) the Account Owner is responsible for supervising each minor's use of the Service; (e) the
        Account Owner may revoke, modify, or delete any Child Profile at any time; and (f) the minor is not
        a counterparty to these Terms.
      </p>

      <h3>4. Nature of the Service</h3>
      <p>
        The Service is a household organization and task-management platform. It enables the Account Owner
        to create, assign, schedule, and track household tasks; define household-internal rewards; record
        completions and approvals; issue and manage non-monetary in-platform credits used solely within the
        household; and access related organizational features. <strong>The Service is not</strong> therapy,
        counseling, psychological or behavioral health care; childcare, supervision, or monitoring;
        educational instruction, tutoring, or special-education service; medical treatment or advice;
        financial services, money transmission, stored value, banking, lending, securities, or virtual
        currency; employment, labor, staffing, or wage management; or any emergency, life-safety, or
        first-responder service. The Service is a software tool and is not a substitute for parental
        judgment or supervision.
      </p>

      <h3>5. Parent and Guardian Responsibilities</h3>
      <p>The Account Owner is solely responsible for, without limitation:</p>
      <ul>
        <li>
          the selection, age-appropriateness, safety, frequency, and difficulty of all tasks and chores
          assigned to minors;
        </li>
        <li>
          all rules, expectations, rewards, penalties, restrictions, deductions, and disciplinary decisions
          within the household;
        </li>
        <li>
          actual supervision of all minors performing tasks, including physical supervision of any task
          involving tools, heat, water, climbing, lifting, outdoor activity, animals, electrical equipment,
          chemicals, food preparation, transportation, or any other risk;
        </li>
        <li>
          ensuring that no task assigned through the Service violates applicable child-labor,
          school-attendance, or other laws;
        </li>
        <li>
          reviewing and moderating all content uploaded by Child Profiles, including proof photos and
          videos, before relying on or sharing such content;
        </li>
        <li>managing privacy, screen-time, and device-use settings appropriate to each child;</li>
        <li>maintaining the confidentiality of account credentials;</li>
        <li>communicating these Terms and any household-specific rules to minors using the Service; and</li>
        <li>
          all interactions, disputes, or disagreements between household members, including co-parents,
          guardians, caregivers, and minors.
        </li>
      </ul>
      <p>
        The Company does not supervise, vet, or validate any task, reward, household rule, or interaction
        and is not a party to any intra-household dispute.
      </p>

      <h3>6. Safety and Supervision Disclaimer</h3>
      <p>
        The Service does not evaluate, certify, or guarantee the safety, suitability, age-appropriateness,
        legality, or developmental appropriateness of any task, reward, content, or household rule. The
        Account Owner assumes all risk associated with any task assigned through the Service. The Company
        is not liable for any injury, illness, property damage, emotional distress, behavioral outcome,
        developmental outcome, educational outcome, or other harm arising from or relating to any task,
        reward, household decision, or interaction. <strong>The Service is not designed for emergencies.</strong>{" "}
        In an emergency, call 911 (or your local equivalent).
      </p>

      <h3>7. Rewards, Points, Credits, and Time-Banking Disclaimer</h3>
      <p>
        Points, credits, tokens, badges, streaks, time-bank balances, and similar indicators ("
        <strong>Credits</strong>") are non-monetary, household-internal tracking mechanisms only. Credits
        have <strong>no cash value</strong>; are not currency, securities, stored value, gift cards,
        prepaid access, virtual currency, cryptocurrency, or any financial instrument; are not transferable
        outside the household account; confer no property right; may be modified, paused, expired, or
        revoked at any time by the Account Owner, by the Company, or by operation of the Service; and do
        not establish any obligation of the Company to deliver, fulfill, or honor any reward defined by the
        Account Owner. Rewards are defined, funded, and fulfilled solely by the Account Owner.
      </p>

      <h3>8. No Financial, Banking, or Employment Relationship</h3>
      <p>
        Nothing in the Service creates an employer-employee, independent-contractor, agency, partnership,
        joint-venture, or fiduciary relationship between any user (including any minor) and the Company, or
        between any minor and the Account Owner by virtue of using the Service. Tasks tracked through the
        Service are household chores, not employment. Credits are not wages or remuneration. The Service
        does not provide money transmission, banking, escrow, custody, payroll, tax-reporting, or
        financial-account services.
      </p>

      <h3>9. User-Generated Content</h3>
      <p>
        Users may upload content through the Service, including proof photos and videos, task descriptions,
        notes, messages, initiative submissions, and other materials ("<strong>User Content</strong>"). You
        retain ownership of User Content. You grant the Company a worldwide, non-exclusive, royalty-free,
        sublicensable, transferable license to host, store, reproduce, modify (for technical purposes such
        as resizing or transcoding), display, and transmit your User Content solely to operate, secure,
        improve, and support the Service and to comply with legal obligations. The license terminates when
        the User Content is deleted, except (i) for retention in backups for a commercially reasonable
        period, (ii) as required by law, and (iii) for aggregated or de-identified data. You represent and
        warrant that you have all rights necessary to grant this license.
      </p>

      <h3>10. Uploaded Photos and Videos</h3>
      <p>
        Photos and videos uploaded as "proof of completion" or otherwise are User Content subject to
        Section 9 and the Acceptable Use Policy. The Account Owner is solely responsible for ensuring that
        uploads do not depict any individual in a manner that is unsafe, exploitative, sexualized, nude,
        partially nude, in a state of undress, or otherwise inappropriate; do not depict third parties
        without appropriate consent; do not contain location-identifying metadata the Account Owner is
        unwilling to share; and have been age-appropriately reviewed by the Account Owner. The Company may,
        but is not obligated to, scan, review, moderate, remove, or block any uploaded media at its sole
        discretion. Removal is not an admission of liability.
      </p>

      <h3>11. Prohibited Conduct</h3>
      <p>
        You agree not to (and not to permit any user of your account to): use the Service in violation of
        any law (including child-labor, child-safety, school-attendance, privacy, intellectual-property,
        export-control, or sanctions laws); upload any unlawful, defamatory, harassing, threatening,
        hateful, obscene, sexually explicit, child sexual abuse material ("CSAM"), violent, or otherwise
        objectionable content; upload any image or video depicting a minor in a sexualized manner, nude,
        partially nude, in undergarments, in a bathing or bathroom setting, or in any state that a
        reasonable parent would not openly share; impersonate any person; use the Service to harass, bully,
        intimidate, surveil, or stalk any person; interfere with, disrupt, overload, or attempt to gain
        unauthorized access to the Service; reverse engineer, decompile, scrape, or extract data; use the
        Service to develop a competing product or train any machine-learning model; circumvent any rate
        limit, security control, or moderation system; use the Service to evaluate or facilitate
        employment, lending, insurance, housing, education, or other consequential decisions about any
        person; submit false reports of abuse or false copyright claims; or assign tasks that are illegal,
        unsafe, or inappropriate for the assigned minor. Violation may result in immediate suspension or
        termination without notice, content removal, and referral to law enforcement.
      </p>

      <h3>12. Child Safety and Content Moderation</h3>
      <p>
        The Company has zero tolerance for child sexual abuse material, child sexual exploitation, and
        content that endangers minors. The Company may use automated and human review (including
        hash-matching, classifier-based detection, and manual moderation) to identify and remove prohibited
        content. The Company will report apparent CSAM to the National Center for Missing &amp; Exploited
        Children (NCMEC) as required by 18 U.S.C. § 2258A and may report other unlawful content to
        authorities. Report concerns to <a href={`mailto:${TRUST_EMAIL}`}>{TRUST_EMAIL}</a>. See the{" "}
        <Link to="/child-safety">Child Safety &amp; Moderation Policy</Link>.
      </p>

      <h3>13. AI-Generated Suggestions Disclaimer</h3>
      <p>
        The Service may offer features that use artificial intelligence or machine-learning techniques to
        generate suggested task titles, descriptions, rewards, schedules, encouragement language,
        summaries, or other outputs ("<strong>AI Output</strong>"). AI Output is provided "as is" for
        informational and inspirational purposes only; may be inaccurate, incomplete, outdated, biased,
        offensive, or otherwise inappropriate; is not professional advice of any kind, including medical,
        psychological, educational, parenting, legal, or financial advice; must be independently reviewed
        and approved by the Account Owner before being assigned, presented to a minor, or relied upon; and
        does not reflect the views of the Company.
      </p>

      <h3>14. Messaging and Notification Disclaimer</h3>
      <p>
        The Service may deliver push notifications, in-app messages, emails, and (where enabled) SMS. The
        Company does not guarantee timely or successful delivery of any notification. Delivery depends on
        third-party networks, carriers, operating systems, and devices outside the Company's control. The
        Service must not be relied upon for time-sensitive, safety-critical, medical, or emergency
        communication. Standard message and data rates may apply.
      </p>

      <h3>15. Geolocation and Future Mobile Features</h3>
      <p>
        The Service may, now or in the future, offer optional features that use device location (approximate
        or precise), geofencing, "arrived home" detection, or similar capabilities. These features are off
        by default and require explicit, in-product consent before enablement. The Account Owner is
        responsible for determining whether to enable location features for any Child Profile, for obtaining
        any required consent from other adults whose location may be inferred, and acknowledges that
        location accuracy is not guaranteed and that these features are not a safety, monitoring, or
        supervisory service.
      </p>

      <h3>16. Subscriptions, Payments, and Billing</h3>
      <p>
        Certain features may require a paid subscription. By initiating a subscription you authorize the
        Company and its payment processors to charge the applicable fees, including recurring charges, to
        the payment method on file. Unless otherwise stated, subscriptions auto-renew at the then-current
        price for the same term; you may cancel at any time, effective at the end of the current billing
        period; fees are <strong>non-refundable</strong> except where required by law; the Company may
        change pricing upon reasonable advance notice, with changes effective on the next renewal; taxes are
        your responsibility where not collected by the Company; subscriptions purchased through a
        third-party app store are subject to that store's billing terms; and failure to pay may result in
        suspension or termination of paid features.
      </p>

      <h3>17. Intellectual Property</h3>
      <p>
        The Service, including all software, designs, graphics, text, logos, and trademarks (excluding User
        Content), is owned by the Company or its licensors and protected by copyright, trademark, and other
        laws. Subject to your compliance with these Terms, the Company grants you a limited, revocable,
        non-exclusive, non-transferable, non-sublicensable license to access and use the Service for the
        personal, non-commercial use of your household. All rights not expressly granted are reserved.
        "ChoreChampz" and associated marks are trademarks of the Company.
      </p>

      <h3>18. DMCA / Copyright Complaints</h3>
      <p>
        The Company complies with the Digital Millennium Copyright Act, 17 U.S.C. § 512. See the{" "}
        <Link to="/dmca">DMCA Policy</Link> for the notice and counter-notice procedure. Repeat infringers
        will have their accounts terminated under appropriate circumstances.
      </p>

      <h3>19. Third-Party Services</h3>
      <p>
        The Service may integrate with or link to third-party services, including hosting, analytics,
        payment processing, push-notification, email, SMS, and authentication providers. The Company is
        not responsible for, and does not endorse, any third-party service. Your use of any third-party
        service is governed by that party's terms and privacy practices.
      </p>

      <h3>20. Data Retention and Deletion</h3>
      <p>
        The Company retains data for as long as reasonably necessary to provide the Service, comply with
        legal obligations, resolve disputes, and enforce agreements. The Account Owner may delete Child
        Profiles, User Content, and the account at any time through the Service. Residual data may persist
        in backups, audit logs, and aggregated form for a commercially reasonable period. See the{" "}
        <Link to="/privacy">Privacy Policy</Link>.
      </p>

      <h3>21. Termination and Suspension Rights</h3>
      <p>
        The Company may suspend, restrict, or terminate access to the Service, in whole or in part, with or
        without notice and at its sole discretion, including for suspected violation of these Terms or any
        applicable law, suspected fraud or abuse, risk to safety, protection of the Service or other
        users, extended inactivity, or cessation of the Service or any feature. The Account Owner may
        terminate the account at any time. Sections that by their nature should survive termination
        (including Sections 6, 7, 8, 9, 11, 17, 22–28) survive.
      </p>

      <h3>22. Disclaimer of Warranties</h3>
      <p>
        THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITH ALL FAULTS, AND WITHOUT WARRANTY OF ANY
        KIND. TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE COMPANY DISCLAIMS ALL WARRANTIES, EXPRESS,
        IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
        PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY, RELIABILITY, AVAILABILITY, SECURITY, AND COURSE OF
        DEALING. THE COMPANY DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE
        FROM HARMFUL COMPONENTS, OR THAT ANY DATA WILL BE ACCURATE OR PRESERVED. NO ADVICE OR INFORMATION
        OBTAINED FROM THE SERVICE CREATES ANY WARRANTY NOT EXPRESSLY STATED HEREIN.
      </p>

      <h3>23. Limitation of Liability</h3>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL THE COMPANY, ITS AFFILIATES, OR ITS OR
        THEIR DIRECTORS, OFFICERS, EMPLOYEES, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
        SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA,
        GOODWILL, OR OTHER INTANGIBLE LOSSES, OR ANY DAMAGES FOR PERSONAL INJURY, PROPERTY DAMAGE,
        EMOTIONAL DISTRESS, BEHAVIORAL OUTCOME, EDUCATIONAL OUTCOME, OR DEVELOPMENTAL OUTCOME, ARISING OUT
        OF OR RELATING TO THE SERVICE, ANY TASK, REWARD, USER CONTENT, AI OUTPUT, NOTIFICATION, OR DISPUTE
        BETWEEN HOUSEHOLD MEMBERS, REGARDLESS OF LEGAL THEORY, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
        DAMAGES. IN NO EVENT WILL THE AGGREGATE LIABILITY OF THE COMPANY EXCEED THE GREATER OF (A) THE
        AMOUNT YOU PAID THE COMPANY IN THE TWELVE (12) MONTHS PRECEDING THE EVENT OR (B) ONE HUNDRED U.S.
        DOLLARS (US $100).
      </p>

      <h3>24. Indemnification</h3>
      <p>
        You agree to defend, indemnify, and hold harmless the Company and its affiliates, officers,
        directors, employees, agents, and licensors from and against any and all claims, liabilities,
        damages, losses, judgments, fines, penalties, costs, and expenses (including reasonable attorneys'
        fees) arising out of or relating to your or your household's use of the Service; any User Content
        uploaded by you or any user of your account; any task, chore, reward, or household decision; any
        injury, harm, or dispute involving any household member; your violation of these Terms or any
        applicable law; or your violation of any third-party right. The Company may assume exclusive
        defense of any matter subject to indemnification.
      </p>

      <h3>25. Binding Arbitration; Class Action Waiver</h3>
      <p>
        <strong>
          PLEASE READ THIS SECTION CAREFULLY. IT REQUIRES BINDING INDIVIDUAL ARBITRATION AND WAIVES YOUR
          RIGHT TO A JURY TRIAL AND TO PARTICIPATE IN CLASS OR REPRESENTATIVE PROCEEDINGS.
        </strong>
      </p>
      <p>
        <strong>(a) Agreement to Arbitrate.</strong> You and the Company agree that any dispute, claim, or
        controversy arising out of or relating to these Terms or the Service ("<strong>Dispute</strong>")
        shall be resolved exclusively by final, binding, individual arbitration administered by JAMS under
        its Streamlined Arbitration Rules, except that this Section is governed by the Federal Arbitration
        Act. The arbitrator shall be a single neutral.
      </p>
      <p>
        <strong>(b) Informal Resolution.</strong> Before initiating arbitration, the party raising a
        Dispute shall send written notice to the other describing the Dispute and proposed resolution. The
        parties shall negotiate in good faith for at least sixty (60) days.
      </p>
      <p>
        <strong>(c) Seat and Procedure.</strong> The seat of arbitration shall be Maricopa County,
        Arizona. The arbitrator may conduct proceedings by telephone, video, or in writing where
        practicable.
      </p>
      <p>
        <strong>(d) Class Action Waiver.</strong>{" "}
        <strong>
          ARBITRATION SHALL BE CONDUCTED ONLY ON AN INDIVIDUAL BASIS. CLASS, COLLECTIVE, MASS,
          CONSOLIDATED, AND REPRESENTATIVE ARBITRATIONS AND ACTIONS ARE NOT PERMITTED.
        </strong>{" "}
        If a court determines this class waiver is unenforceable with respect to a particular claim, that
        claim shall be severed and pursued in court while all other claims remain in arbitration.
      </p>
      <p>
        <strong>(e) Mass Arbitration Protocol.</strong> If twenty-five (25) or more similar demands are
        filed by or with coordinated counsel, the parties shall meet and confer on a batching protocol
        prior to fee assessment.
      </p>
      <p>
        <strong>(f) Exceptions.</strong> Either party may (i) bring an individual claim in small-claims
        court if eligible and (ii) seek injunctive relief in a court of competent jurisdiction to protect
        intellectual property or confidential information.
      </p>
      <p>
        <strong>(g) Opt-Out.</strong> You may opt out of this Section 25 by sending written notice to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> within thirty (30) days of first accepting
        these Terms, including your name, account email, and a clear statement of intent to opt out.
      </p>
      <p>
        <strong>(h) Survival.</strong> This Section survives termination.
      </p>

      <h3>26. Governing Law and Venue</h3>
      <p>
        These Terms are governed by the laws of the State of Arizona, without regard to its conflict-of-law
        principles, and, with respect to arbitration, the Federal Arbitration Act. For matters not subject
        to arbitration, the parties consent to the exclusive jurisdiction of the state and federal courts
        located in Maricopa County, Arizona, and waive any objection to venue or inconvenient forum. The
        United Nations Convention on Contracts for the International Sale of Goods does not apply.
      </p>

      <h3>27. Changes to Terms</h3>
      <p>
        The Company may modify these Terms at any time. Material changes will be communicated through the
        Service or by email to the Account Owner with reasonable advance notice where practicable.
        Continued use following the effective date constitutes acceptance. Users with an accepted version
        below the current version (currently version {CURRENT_TERMS_VERSION}) will be required to
        re-accept on next sign-in.
      </p>

      <h3>28. Miscellaneous</h3>
      <p>
        <strong>(a) Entire Agreement.</strong> These Terms, the Privacy Policy, and any policies referenced
        herein constitute the entire agreement between the parties regarding the Service.{" "}
        <strong>(b) Severability.</strong> If any provision is held unenforceable, the remainder shall
        remain in effect. <strong>(c) No Waiver.</strong> Failure to enforce any provision is not a waiver.{" "}
        <strong>(d) Assignment.</strong> You may not assign these Terms; the Company may assign freely.{" "}
        <strong>(e) Force Majeure.</strong> Neither party is liable for delay or failure due to causes
        beyond reasonable control. <strong>(f) Notices.</strong> The Company may provide notices via the
        Service or to the email on file; notices to the Company must be sent to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.{" "}
        <strong>(g) No Third-Party Beneficiaries.</strong> None, except as expressly stated.
      </p>

      <h3>29. Contact</h3>
      <p>
        {COMPANY_NAME}
        <br />
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </LegalShell>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalShell title="Privacy Policy" version={CURRENT_PRIVACY_VERSION}>
      <p className="text-xs uppercase tracking-wide text-slate-500">
        {COMPANY_NAME} · Effective {EFFECTIVE_DATE}
      </p>

      <h3>1. Introduction and Scope</h3>
      <p>
        This Privacy Policy explains how {COMPANY_NAME} collects, uses, discloses, and safeguards
        information in connection with the Service. By using the Service, the Account Owner consents to the
        practices described herein on behalf of the household, including each Child Profile. Where this
        Policy and the Terms of Service conflict regarding privacy practices, this Policy controls.
      </p>

      <h3>2. Information We Collect</h3>
      <p>
        <strong>Information you provide directly:</strong> account registration data (name, email,
        password [hashed], household name, role); Child Profile data provided by the Account Owner (first
        name or nickname — full legal names are not required and are discouraged — age range or birth year,
        optional avatar, household role); task and reward data (titles, descriptions, schedules,
        categories, completion records, approvals, point/credit values, redemptions); User Content (proof
        photos and videos, notes, messages, initiative submissions); payment data (limited billing details
        handled by our payment processor); and communications you send to support.
      </p>
      <p>
        <strong>Information collected automatically:</strong> device and usage data (device type, OS, app
        version, browser, IP address, language, time zone, crash logs, performance metrics, feature usage);
        and cookies and similar technologies on web (session, security, limited analytics).
      </p>
      <p>
        <strong>Information from third parties:</strong> authentication providers (if you sign in via a
        third party), payment processors (transaction confirmations only — not full card numbers), and
        hosting and infrastructure providers (operational telemetry).
      </p>
      <p>
        We do not require, and the Service is designed to discourage, collection of children's full legal
        names, school names, government identifiers, or precise residential addresses.
      </p>

      <h3>3. Parent-Controlled Child Data</h3>
      <p>
        All information associated with a Child Profile is created, controlled, and managed by the Account
        Owner. The Company processes Child Profile data as a service provider to the Account Owner and
        only as necessary to provide the Service. The Account Owner may view, edit, export, or delete
        Child Profile data at any time.
      </p>

      <h3>4. Children's Privacy (COPPA and Similar Laws)</h3>
      <p>
        The Service is directed to adults. Child Profiles are sub-profiles managed by the Account Owner,
        who acts as the verifiable parental consent provider for the household under the Children's Online
        Privacy Protection Act ("COPPA"), 15 U.S.C. §§ 6501–6506 and 16 C.F.R. Part 312.
      </p>
      <ul>
        <li>
          By creating a Child Profile, the Account Owner represents that they are the parent or legal
          guardian of the minor and provide verifiable parental consent.
        </li>
        <li>
          We collect the minimum information reasonably necessary to operate household task-management
          features for Child Profiles.
        </li>
        <li>
          We do not condition a minor's participation on disclosing more information than is reasonably
          necessary.
        </li>
        <li>
          We do not knowingly sell or "share" (under applicable state privacy laws) personal information
          of any minor, and we do not engage in cross-context behavioral advertising directed to minors.
        </li>
        <li>
          Parents may review, request deletion of, and refuse further collection of information from their
          minor by managing the Child Profile, deleting it, or contacting{" "}
          <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
        </li>
        <li>
          We do not knowingly allow minors to register independent accounts. If we learn an account has
          been created without parental authorization, we will delete it.
        </li>
      </ul>

      <h3>5. Account and Profile Information</h3>
      <p>
        Account data is used to authenticate users, deliver the Service, maintain household structure,
        support customer service, and comply with legal obligations.
      </p>

      <h3>6. Uploaded Media</h3>
      <p>
        Proof photos and videos and other uploaded media are stored to enable the Service's task-approval
        workflow and household record-keeping. Media may be processed for technical operations (resizing,
        thumbnailing, virus scanning) and for safety scanning, including detection of apparent CSAM
        consistent with applicable law. The Company does not use Child Profile media to train
        general-purpose AI models. Account Owners may delete media at any time.
      </p>

      <h3>7. Device and Usage Data</h3>
      <p>
        We process device and usage data to operate, secure, debug, analyze, and improve the Service, to
        detect and prevent fraud and abuse, and to comply with legal obligations.
      </p>

      <h3>8. Notifications and Messaging Data</h3>
      <p>
        We process notification preferences, push tokens, email addresses, and (if enabled) phone numbers
        to deliver notifications and messages requested by the Account Owner. Delivery is not guaranteed.
        Standard message and data rates may apply for SMS, if offered.
      </p>

      <h3>9. Optional Location Data</h3>
      <p>
        If, in the future, location features are offered and enabled by the Account Owner, location data
        will be processed only for the purpose enabled (e.g., geofenced task triggers). Location features
        are opt-in, can be disabled at any time, and are not used for advertising. Location data associated
        with Child Profiles will not be sold or shared with third parties for their independent use.
      </p>

      <h3>10. Cookies and Analytics</h3>
      <p>
        The web application uses essential cookies for authentication and security and may use
        privacy-respecting analytics to understand aggregate usage. We do not use cookies for cross-context
        behavioral advertising directed to minors. Where required, a cookie consent mechanism will be
        provided. Mobile applications use platform-standard identifiers consistent with Apple App Tracking
        Transparency and Android equivalents; no tracking will be initiated without the required
        platform-level consent.
      </p>

      <h3>11. Third-Party Service Providers</h3>
      <p>
        We engage vendors to host data, process payments, deliver email and push notifications, perform
        analytics, perform safety scanning, and provide customer support. These vendors are bound by
        written agreements requiring them to process personal information only on our instructions and to
        maintain appropriate safeguards. A current list of subprocessor categories is available on request
        to <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
      </p>

      <h3>12. Payment Processors</h3>
      <p>
        Subscription payments are processed by a PCI-DSS-compliant processor. The Company does not store
        full payment card numbers. The payment processor's privacy practices govern its processing of
        payment data.
      </p>

      <h3>13. Data Sharing Limitations</h3>
      <p>
        We do not sell personal information. We do not share personal information for cross-context
        behavioral advertising. We do not share Child Profile data with third parties except (a) service
        providers acting on our behalf; (b) as directed by the Account Owner; (c) as required by law or
        legal process; (d) to protect the rights, property, or safety of the Company, users, or others
        (including CSAM reporting); and (e) in connection with a merger, acquisition, financing, or sale of
        assets, subject to confidentiality and continued protection.
      </p>

      <h3>14. No Sale of Child Data; No Targeted Advertising to Children</h3>
      <p>
        We do not sell or "share" personal information of any minor. We do not deliver targeted,
        interest-based, or behavioral advertising to minors. We do not engage in profiling of minors that
        produces legal or similarly significant effects.
      </p>

      <h3>15. No Biometric Processing (Current State)</h3>
      <p>
        We do not currently process facial-recognition templates, fingerprint templates, voiceprints,
        retina scans, or other biometric identifiers. We will not introduce biometric processing without
        an updated Privacy Policy, explicit notice, and any required opt-in consent under applicable law.
      </p>

      <h3>16. Security Practices</h3>
      <p>
        We implement commercially reasonable administrative, technical, and physical safeguards, including
        encryption in transit, encrypted backups, access controls, tenant isolation by household,
        least-privilege access, audit logging, and regular security review. <strong>No security measure
        is perfect.</strong> We cannot and do not guarantee the security of any information. Users are
        responsible for maintaining the confidentiality of their credentials and for promptly notifying us
        at <a href={`mailto:${SECURITY_EMAIL}`}>{SECURITY_EMAIL}</a> of any suspected compromise.
      </p>

      <h3>17. Data Retention</h3>
      <p>
        We retain personal information for as long as necessary to provide the Service, satisfy legal,
        accounting, tax, audit, and dispute-resolution obligations, and enforce our agreements. When data
        is no longer needed, it is deleted or de-identified. Deleted Child Profile content is removed from
        active systems promptly and from backups within a commercially reasonable backup cycle. Aggregated
        or de-identified data may be retained indefinitely.
      </p>

      <h3>18. Parent Rights and Deletion Rights</h3>
      <p>
        The Account Owner may, with respect to the household account and each Child Profile, access and
        review personal information; correct or update inaccurate information; delete information or the
        entire account; export account data in a portable format where reasonably feasible; withdraw
        consent to optional features (such as location); and object to or restrict certain processing,
        where required by law. Residents of California, Colorado, Connecticut, Virginia, Utah, and other
        states with applicable privacy laws have additional rights. Requests may be submitted to{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. We will verify identity and account
        ownership before fulfilling a request. We do not discriminate against users for exercising privacy
        rights.
      </p>

      <h3>19. International Users</h3>
      <p>
        The Service is operated from the United States. By using the Service from outside the United
        States, you consent to the transfer of personal information to the United States. We do not
        currently offer the Service to users in the European Economic Area, the United Kingdom, or
        Switzerland, and the Service is not intended for use in those regions.
      </p>

      <h3>20. Changes to this Privacy Policy</h3>
      <p>
        We may update this Policy from time to time. Material changes will be communicated through the
        Service or by email with reasonable advance notice. Continued use after the effective date
        indicates acceptance. For changes that materially expand the use of children's personal
        information, we will obtain renewed parental consent where required by law.
      </p>

      <h3>21. Contact</h3>
      <p>
        Privacy inquiries: <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>
        <br />
        Security reports: <a href={`mailto:${SECURITY_EMAIL}`}>{SECURITY_EMAIL}</a>
      </p>
    </LegalShell>
  );
}

export function AcceptableUsePolicy() {
  return (
    <LegalShell title="Acceptable Use Policy">
      <p>
        You agree to use the Service lawfully, respectfully, and in accordance with these rules. Violation
        may result in immediate suspension or termination and reporting to authorities.
      </p>
      <h3>Prohibited content and conduct</h3>
      <ol>
        <li>Illegal content of any kind.</li>
        <li>
          Child sexual abuse material (CSAM) — zero tolerance. Reported to NCMEC and law enforcement.
        </li>
        <li>
          Sexualized, nude, partially nude, undergarment, bathing, or bathroom imagery of any minor.
        </li>
        <li>Imagery of third parties without consent.</li>
        <li>Hate, harassment, threats, doxxing, or bullying.</li>
        <li>
          Tasks that violate child-labor laws, school-attendance laws, safety regulations, or that are
          unreasonably dangerous for the assigned minor.
        </li>
        <li>
          Tasks that constitute physical harm, deprivation of food/water/sleep/medical care, or
          psychological abuse.
        </li>
        <li>Use of the Service to surveil, stalk, or harass any individual.</li>
        <li>Reverse engineering, scraping, or unauthorized data extraction.</li>
        <li>Use of the Service to train machine-learning models or develop competing products.</li>
        <li>Use of the Service for employment-style management of any individual.</li>
        <li>Misrepresentation of identity, age, guardianship, or authority.</li>
        <li>Circumvention of safety, moderation, billing, or access controls.</li>
        <li>Distribution of malware, spam, or fraudulent content.</li>
      </ol>
      <p>
        Report violations: <a href={`mailto:${TRUST_EMAIL}`}>{TRUST_EMAIL}</a>
      </p>
    </LegalShell>
  );
}

export function ChildSafetyPolicy() {
  return (
    <LegalShell title="Child Safety & Moderation Policy">
      <p>{COMPANY_NAME} is committed to protecting minors from exploitation and abuse on the Service.</p>
      <h3>Standards</h3>
      <ul>
        <li>Zero tolerance for CSAM, child sexual exploitation, grooming, and trafficking content.</li>
        <li>Zero tolerance for sexualized depictions of minors of any kind.</li>
        <li>Zero tolerance for tasks or rewards that endanger a minor's health, safety, or welfare.</li>
      </ul>
      <h3>Detection and Review</h3>
      <ul>
        <li>
          Automated scanning of uploaded media using industry-standard hash-matching and classification
          tools where commercially available.
        </li>
        <li>Human review of escalated content by trained moderators.</li>
        <li>
          Manual review of user reports submitted to{" "}
          <a href={`mailto:${TRUST_EMAIL}`}>{TRUST_EMAIL}</a>.
        </li>
      </ul>
      <h3>Action</h3>
      <ul>
        <li>Immediate removal of violating content.</li>
        <li>Account suspension or termination.</li>
        <li>Reporting of apparent CSAM to NCMEC under 18 U.S.C. § 2258A.</li>
        <li>Cooperation with law enforcement and preservation of evidence under applicable law.</li>
      </ul>
      <h3>Account Owner Duties</h3>
      <ul>
        <li>Supervise Child Profile uploads.</li>
        <li>Approve or reject proof media; do not approve unsafe or inappropriate content.</li>
        <li>Report concerning content immediately.</li>
      </ul>
    </LegalShell>
  );
}

export function DmcaPolicy() {
  return (
    <LegalShell title="DMCA / Copyright Policy">
      <p>
        {COMPANY_NAME} responds to clear notices of alleged copyright infringement consistent with the
        Digital Millennium Copyright Act, 17 U.S.C. § 512.
      </p>
      <h3>Notice requirements</h3>
      <ol>
        <li>A physical or electronic signature of the rights holder or authorized agent.</li>
        <li>Identification of the copyrighted work claimed to be infringed.</li>
        <li>
          Identification of the allegedly infringing material and information reasonably sufficient to
          permit location.
        </li>
        <li>Contact information of the complaining party.</li>
        <li>A statement of good-faith belief that the use is not authorized.</li>
        <li>A statement, under penalty of perjury, that the information is accurate and the party is authorized.</li>
      </ol>
      <p>
        Send to the DMCA Designated Agent at <a href={`mailto:${DMCA_EMAIL}`}>{DMCA_EMAIL}</a>.
      </p>
      <p>
        Counter-notifications may be submitted under 17 U.S.C. § 512(g). The Company terminates repeat
        infringers under appropriate circumstances. Bad-faith notices may give rise to liability under 17
        U.S.C. § 512(f).
      </p>
    </LegalShell>
  );
}
