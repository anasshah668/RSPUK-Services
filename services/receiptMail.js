import sgMail from '@sendgrid/mail';

const trim = (value) => String(value ?? '').trim();

/** Safe for HTML email body (user-supplied fields). */
const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatMoney = (amount, currency) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP' }).format(n);
  } catch {
    return `${currency || 'GBP'} ${n.toFixed(2)}`;
  }
};

const buildReceiptText = ({
  orderReference,
  paymentId,
  amount,
  currency,
  customerName,
  customerEmail,
  phone,
  addressLines,
  orderTitle,
  orderDescription,
  summaryLines,
}) => {
  const lines = [
    'Payment successful',
    '',
    `Thank you${customerName ? `, ${customerName}` : ''}.`,
    '',
    `Order reference: ${orderReference}`,
    `Payment reference: ${paymentId}`,
    `Amount paid: ${formatMoney(amount, currency)}`,
    '',
    'Bill to:',
    customerName,
    customerEmail,
    phone,
    ...addressLines.filter(Boolean),
    '',
  ];
  if (orderTitle) lines.push(`Order: ${orderTitle}`);
  if (orderDescription) lines.push(orderDescription);
  if (summaryLines?.length) {
    lines.push('', 'Summary:');
    summaryLines.forEach(({ label, value }) => lines.push(`  ${label}: ${value}`));
  }
  lines.push('', '—', 'This email is your payment receipt. Please keep it for your records.');
  return lines.join('\n');
};

/**
 * Table + inline styles for Gmail, Outlook, Yahoo, Apple Mail.
 * Mirrors UI PaymentSuccessPage: emerald header, white card, detail panel.
 */
const buildReceiptHtml = ({
  orderReference,
  paymentId,
  amount,
  currency,
  customerName,
  customerEmail,
  phone,
  addressLines,
  orderTitle,
  orderDescription,
  summaryLines,
}) => {
  const amountLabel = formatMoney(amount, currency);
  const showPaymentRef = paymentId && String(paymentId) !== String(orderReference);
  const fontStack =
    "'Lexend Deca', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  const brandName = trim(process.env.BRAND_NAME) || 'River Signs & Print';
  const siteUrl = trim(process.env.FRONTEND_URL || process.env.APP_BASE_URL || '');
  const siteUrlSafe = /^https?:\/\//i.test(siteUrl) ? siteUrl : '';

  const summaryRows =
    Array.isArray(summaryLines) && summaryLines.length > 0
      ? summaryLines
          .map(
            ({ label, value }) => `
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#6b7280;font-family:${fontStack};vertical-align:top;width:45%;">${esc(label)}</td>
            <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;font-family:${fontStack};text-align:right;word-break:break-word;">${esc(value)}</td>
          </tr>`,
          )
          .join('')
      : '';

  const addressBlock = addressLines.filter(Boolean).map((line) => esc(line)).join('<br/>');

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${esc(`Payment successful — ${orderReference}`)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f9fafb;">
    <tr>
      <td align="center" style="padding:40px 16px;font-family:${fontStack};">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:512px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d1fae5;">
          <!-- Header: emerald→teal (bgcolor for Outlook; gradient where supported) -->
          <tr>
            <td align="center" bgcolor="#059669" style="padding:32px 24px;background-color:#059669;background-image:linear-gradient(90deg,#059669 0%,#0d9488 100%);color:#ffffff;">
              <div style="font-size:40px;line-height:1;margin-bottom:8px;" aria-hidden="true">&#10003;</div>
              <h1 style="margin:0;font-size:24px;line-height:1.3;font-weight:700;font-family:${fontStack};color:#ffffff;">Payment successful</h1>
              <p style="margin:12px 0 0;font-size:14px;line-height:1.5;color:#ecfdf5;font-family:${fontStack};">
                Thank you${customerName ? `, ${esc(customerName)}` : ''}.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;font-family:${fontStack};color:#1f2937;">
              ${orderTitle ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#4b5563;"><span style="font-weight:600;color:#111827;">Order: </span>${esc(orderTitle)}</p>` : ''}

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f9fafb;border:1px solid #f3f4f6;border-radius:12px;">
                <tr>
                  <td style="padding:16px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="padding:4px 0;font-size:14px;color:#6b7280;font-family:${fontStack};vertical-align:top;width:42%;">Order reference</td>
                        <td style="padding:4px 0;font-size:14px;color:#111827;font-weight:600;font-family:ui-monospace,'Cascadia Mono','Segoe UI Mono',monospace;text-align:right;word-break:break-all;">${esc(orderReference)}</td>
                      </tr>
                      ${showPaymentRef ? `<tr>
                        <td style="padding:8px 0 4px;font-size:14px;color:#6b7280;font-family:${fontStack};vertical-align:top;">Payment reference</td>
                        <td style="padding:8px 0 4px;font-size:12px;color:#111827;font-family:ui-monospace,'Cascadia Mono','Segoe UI Mono',monospace;text-align:right;word-break:break-all;">${esc(paymentId)}</td>
                      </tr>` : ''}
                      <tr>
                        <td colspan="2" style="padding:12px 0 8px;border-top:1px solid #e5e7eb;"></td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;font-size:14px;color:#6b7280;font-family:${fontStack};">Amount paid</td>
                        <td style="padding:4px 0;font-size:14px;font-weight:700;color:#047857;font-family:${fontStack};text-align:right;">${esc(amountLabel)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:16px;background-color:#f9fafb;border:1px solid #f3f4f6;border-radius:12px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;font-family:${fontStack};">Bill to</p>
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#111827;font-family:${fontStack};">
                      ${esc(customerName || 'Customer')}<br/>
                      ${esc(customerEmail)}<br/>
                      ${phone ? `${esc(phone)}<br/>` : ''}
                      ${addressBlock ? `${addressBlock}` : ''}
                    </p>
                  </td>
                </tr>
              </table>

              ${orderDescription ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#4b5563;font-family:${fontStack};">${esc(orderDescription)}</p>` : ''}

              ${summaryRows ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:16px;">${summaryRows}</table>` : ''}

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:20px;background-color:#ecfdf5;border:1px solid #d1fae5;border-radius:8px;">
                <tr>
                  <td style="padding:12px 14px;font-size:14px;line-height:1.5;color:#065f46;font-family:${fontStack};">
                    This email is your official payment receipt for <strong style="color:#064e3b;">${esc(brandName)}</strong>. Please keep it for your records and check spam if you don&rsquo;t see it in your inbox.
                  </td>
                </tr>
              </table>

              ${siteUrlSafe ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:20px;">
                <tr>
                  <td align="center">
                    <a href="${esc(siteUrlSafe)}" style="display:inline-block;padding:12px 24px;background-color:#2563eb;border-radius:12px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;font-family:${fontStack};">Back to home</a>
                  </td>
                </tr>
              </table>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * Sends HTML + plain-text receipt (SendGrid). Fails soft — caller should catch.
 */
export async function sendPaymentReceiptEmail({
  to,
  orderReference,
  paymentId,
  amount,
  currency,
  customerName,
  customerEmail,
  phone,
  addressLines = [],
  orderTitle,
  orderDescription,
  summaryLines = [],
}) {
  const disabled = trim(process.env.RECEIPT_EMAIL_ENABLED).toLowerCase() === 'false';
  if (disabled) return { sent: false, reason: 'disabled' };

  const sendGridApiKey = process.env.SENDGRID_API_KEY;
  const senderEmail = process.env.SENDGRID_FROM_EMAIL || process.env.MAIL_FROM;
  if (!sendGridApiKey || !senderEmail) {
    console.warn('[receipt-mail] SendGrid is not configured on server');
    return { sent: false, reason: 'no_sendgrid' };
  }
  sgMail.setApiKey(sendGridApiKey);

  const subject = trim(process.env.RECEIPT_EMAIL_SUBJECT_PREFIX) || 'Payment receipt';
  const payload = {
    orderReference,
    paymentId,
    amount,
    currency,
    customerName,
    customerEmail,
    phone,
    addressLines,
    orderTitle,
    orderDescription,
    summaryLines,
  };
  const text = buildReceiptText(payload);
  const html = buildReceiptHtml(payload);

  try {
    await sgMail.send({
      from: senderEmail,
      to,
      subject: `${subject} — ${orderReference}`,
      text,
      html,
    });
  } catch (err) {
    console.error('[receipt-mail] SendGrid send failed', err?.response?.body || err?.message || err);
    return { sent: false, reason: 'send_failed' };
  }

  console.info(`[receipt-mail] Receipt sent to ${to} (order ${orderReference})`);
  return { sent: true };
}
