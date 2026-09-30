import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const region = process.env.SES_REGION || process.env.AWS_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const fromEmail = String(
  process.env.SES_FROM_EMAIL || process.env.MAIL_FROM || process.env.SENDGRID_FROM_EMAIL || '',
).trim();
const fromName = String(process.env.SES_FROM_NAME || process.env.BRAND_NAME || 'River Signs & Print').trim();
const replyTo = String(process.env.SES_REPLY_TO || '').trim();

export const isSesConfigured = Boolean(region && accessKeyId && secretAccessKey && fromEmail);

if (!isSesConfigured) {
  console.warn('⚠️  AWS SES is not fully configured');
  console.warn('   Set AWS_REGION (or SES_REGION), AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and SES_FROM_EMAIL');
} else {
  console.log(`✅ SES configured (${region} / ${fromEmail})`);
}

let client;
const getClient = () => {
  if (!client) {
    client = new SESClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return client;
};

export const getSesFromAddress = () => {
  if (!fromEmail) return '';
  if (!fromName) return fromEmail;
  return `"${fromName.replace(/"/g, '')}" <${fromEmail}>`;
};

const toPlainText = (html, text) => {
  if (text) return String(text);
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
};

export async function sendEmail({ to, subject, html, text, replyTo: replyToOverride } = {}) {
  if (!isSesConfigured) {
    const error = new Error(
      'AWS SES is not configured. Set AWS credentials and SES_FROM_EMAIL (a verified SES identity).',
    );
    error.code = 'SES_NOT_CONFIGURED';
    throw error;
  }

  const toAddresses = (Array.isArray(to) ? to : [to])
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (!toAddresses.length) {
    const error = new Error('A recipient email is required');
    error.code = 'SES_NO_RECIPIENT';
    throw error;
  }

  const htmlBody = html ? String(html) : '';
  const textBody = toPlainText(htmlBody, text);
  const body = {};
  if (textBody) body.Text = { Data: textBody, Charset: 'UTF-8' };
  if (htmlBody) body.Html = { Data: htmlBody, Charset: 'UTF-8' };

  const replyAddresses = [replyToOverride, replyTo]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  await getClient().send(
    new SendEmailCommand({
      Source: getSesFromAddress(),
      Destination: { ToAddresses: toAddresses },
      ReplyToAddresses: replyAddresses.length ? replyAddresses : undefined,
      Message: {
        Subject: { Data: String(subject || ''), Charset: 'UTF-8' },
        Body: body,
      },
    }),
  );

  return { sent: true };
}
