import { describe, it, expect } from "vitest";
import { renderInvitationEmail } from "../invitation.js";
import { renderVerificationEmail } from "../verification.js";
import { renderPasswordResetEmail } from "../password-reset.js";
import { renderNotificationEmail } from "../notification.js";
import { escapeHtml } from "../layout.js";

describe("email templates", () => {
  describe("renderInvitationEmail", () => {
    it("includes inviter, family, role, and accept URL in HTML + text", () => {
      const r = renderInvitationEmail({
        inviterName: "Alex",
        familyName: "The Smiths",
        acceptUrl: "https://example.com/invite/abc123",
        kind: "CO_PARENT",
      });
      expect(r.subject).toContain("Alex");
      expect(r.subject).toContain("The Smiths");
      expect(r.html).toContain("Alex");
      expect(r.html).toContain("The Smiths");
      expect(r.html).toContain("co-parent");
      expect(r.html).toContain("https://example.com/invite/abc123");
      expect(r.text).toContain("Alex");
      expect(r.text).toContain("https://example.com/invite/abc123");
    });

    it("labels CAREGIVER kind as caregiver", () => {
      const r = renderInvitationEmail({
        inviterName: "Alex",
        familyName: "Smiths",
        acceptUrl: "https://x.test/i",
        kind: "CAREGIVER",
      });
      expect(r.html).toContain("caregiver");
      expect(r.html).not.toContain("co-parent");
    });

    it("renders the access window when validFrom/validUntil provided", () => {
      const from = new Date("2026-05-01T00:00:00Z");
      const until = new Date("2026-05-08T00:00:00Z");
      const r = renderInvitationEmail({
        inviterName: "Alex",
        familyName: "Smiths",
        acceptUrl: "https://x.test/i",
        kind: "CAREGIVER",
        validFrom: from,
        validUntil: until,
      });
      expect(r.html).toContain("Access window");
      expect(r.text).toContain("Access window");
    });

    it("HTML-escapes user-controlled names", () => {
      const r = renderInvitationEmail({
        inviterName: "<img src=x onerror=alert(1)>",
        familyName: "Smiths & Co",
        acceptUrl: "https://x.test/i",
        kind: "CO_PARENT",
      });
      expect(r.html).not.toContain("<img src=x");
      expect(r.html).toContain("&lt;img");
      expect(r.html).toContain("Smiths &amp; Co");
    });
  });

  describe("renderVerificationEmail", () => {
    it("includes verify URL in HTML and text", () => {
      const r = renderVerificationEmail({ verifyUrl: "https://app.test/verify?token=xyz" });
      expect(r.subject.toLowerCase()).toContain("verify");
      expect(r.html).toContain("https://app.test/verify?token=xyz");
      expect(r.text).toContain("https://app.test/verify?token=xyz");
    });
  });

  describe("renderPasswordResetEmail", () => {
    it("includes reset URL and anti-phishing line", () => {
      const r = renderPasswordResetEmail({ resetUrl: "https://app.test/reset?token=abc" });
      expect(r.subject.toLowerCase()).toContain("reset");
      expect(r.html).toContain("https://app.test/reset?token=abc");
      expect(r.text).toMatch(/didn'?t request/i);
    });
  });

  describe("renderNotificationEmail", () => {
    it("uses the title as the subject", () => {
      const r = renderNotificationEmail({ title: "Approval needed", body: "Pick up your room" });
      expect(r.subject).toBe("Approval needed");
      expect(r.html).toContain("Approval needed");
      expect(r.html).toContain("Pick up your room");
    });

    it("renders without body", () => {
      const r = renderNotificationEmail({ title: "Heads up", body: null });
      expect(r.subject).toBe("Heads up");
      expect(r.html).toContain("Heads up");
      expect(r.text).toContain("Heads up");
    });
  });

  describe("escapeHtml", () => {
    it("escapes &, <, >, \", '", () => {
      expect(escapeHtml(`<script>"alert"&'go'</script>`)).toBe(
        "&lt;script&gt;&quot;alert&quot;&amp;&#39;go&#39;&lt;/script&gt;",
      );
    });
  });
});
