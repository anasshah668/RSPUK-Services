const trim = (value) => String(value ?? '').trim();

async function loadNodemailer() {
  try {
    const mod = await import('nodemailer');
    return mod.default;
  } catch {
    return null;
  }
}

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

  const host = trim(process.env.SMTP_HOST);
  if (!host) {
    console.warn('[receipt-mail] SMTP_HOST not set; skipping receipt email');
    return { sent: false, reason: 'no_smtp' };
  }

  const port = Number(process.env.SMTP_PORT) || 587;
  const user = trim(process.env.SMTP_USER);
  const pass = trim(process.env.SMTP_PASS);
  const from = trim(process.env.SMTP_FROM) || user || 'noreply@localhost';

  const nodemailer = await loadNodemailer();
  if (!nodemailer) {
    console.warn('[receipt-mail] nodemailer is not installed; run: npm install nodemailer');
    return { sent: false, reason: 'no_nodemailer' };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    ...(user && pass ? { auth: { user, pass } } : {}),
  });

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

  await transporter.sendMail({
    from,
    to,
    subject: `${subject} — ${orderReference}`,
    text,
  });

  console.info(`[receipt-mail] Receipt sent to ${to} (order ${orderReference})`);
  return { sent: true };
}
