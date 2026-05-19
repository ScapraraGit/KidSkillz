// Minimal HTML email shell. Plain inline-style HTML keeps deps light and
// renders well across Gmail / Outlook / Apple Mail. Swap for @react-email
// later by exporting a render() with the same signature.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface LayoutOpts {
  title: string;
  previewText?: string;
  bodyHtml: string;
}

export function layoutHtml({ title, previewText, bodyHtml }: LayoutOpts): string {
  const preview = previewText
    ? `<span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(previewText)}</span>`
    : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    ${preview}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;box-shadow:0 1px 2px rgba(15,23,42,0.06);overflow:hidden;">
            <tr>
              <td style="padding:20px 28px;background:#6366f1;color:#ffffff;font-size:18px;font-weight:700;">
                ChoreChampz
              </td>
            </tr>
            <tr>
              <td style="padding:28px;font-size:15px;line-height:1.55;color:#0f172a;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.5;border-top:1px solid #e2e8f0;">
                ChoreChampz — chores, rewards, and family wins. Sent because of activity on your family account.
                If you didn&rsquo;t expect this, you can ignore it safely.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buttonHtml(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td style="background:#6366f1;border-radius:8px;">
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}
