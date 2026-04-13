import sgMail from '@sendgrid/mail';

const trim = (value) => String(value ?? '').trim();

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
    'Thank you for your payment.',
    '',
    `Order reference: ${orderReference}`,
    `Payment reference: ${paymentId}`,
    `Amount: ${formatMoney(amount, currency)}`,
    '',
    'Bill to:',
    customerName,
    customerEmail,
    phone,
    ...addressLines.filter(Boolean),
    '',
  ];
  if (orderTitle) lines.push(`Item: ${orderTitle}`);
  if (orderDescription) lines.push(orderDescription);
  if (summaryLines?.length) {
    lines.push('', 'Summary:');
    summaryLines.forEach(({ label, value }) => lines.push(`  ${label}: ${value}`));
  }
  lines.push('', '—', 'This email is your payment receipt. Please keep it for your records.');
  return lines.join('\n');
};

/**
 * Sends a plain-text receipt to the customer. Fails soft — caller should catch.
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

  const subject =
    trim(process.env.RECEIPT_EMAIL_SUBJECT_PREFIX) || 'Payment receipt';
  const text = buildReceiptText({
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
  });

  try {
    await sgMail.send({
      from: senderEmail,
      to,
      subject: `${subject} — ${orderReference}`,
      text,
    });
  } catch (err) {
    console.error('[receipt-mail] SendGrid send failed', err?.response?.body || err?.message || err);
    return { sent: false, reason: 'send_failed' };
  }

  console.info(`[receipt-mail] Receipt sent to ${to} (order ${orderReference})`);
  return { sent: true };
}
