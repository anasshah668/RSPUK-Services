import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';

const region = process.env.SES_REGION || process.env.AWS_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const fromEmail = String(
  process.env.SES_FROM_EMAIL || process.env.MAIL_FROM || process.env.SENDGRID_FROM_EMAIL || '',
).trim();
const fromName = String(process.env.SES_FROM_NAME || process.env.BRAND_NAME || 'River Signs & Print').trim();
const replyTo = String(process.env.SES_REPLY_TO || '').trim();
const EMAIL_LOGO_CID = 'logo@riversigns.co.uk';
const DEFAULT_SITE_URL = 'https://riversigns.co.uk';

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

export const getPublicSiteUrl = () => {
  const candidates = [
    process.env.EMAIL_SITE_URL,
    process.env.FRONTEND_URL,
    process.env.APP_BASE_URL,
    DEFAULT_SITE_URL,
  ];
  for (const value of candidates) {
    const url = String(value || '').trim().replace(/\/+$/, '');
    if (!url) continue;
    if (!/^https:\/\//i.test(url)) continue;
    if (/localhost|127\.0\.0\.1/i.test(url)) continue;
    return url;
  }
  return DEFAULT_SITE_URL;
};

export const getEmailLogoUrl = () => {
  const explicit = String(process.env.EMAIL_LOGO_URL || process.env.BRAND_LOGO_URL || '').trim();
  if (/^https:\/\//i.test(explicit)) return explicit;
  return `${getPublicSiteUrl()}/logo.png`;
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

const encodeSubject = (subject) => {
  const value = String(subject || '');
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
};

const foldBase64 = (value) => String(value).replace(/(.{76})/g, '$1\r\n');

let logoCache;
const loadEmailLogo = async () => {
  if (logoCache !== undefined) return logoCache;
  try {
    const response = await fetch(getEmailLogoUrl());
    if (!response.ok) {
      logoCache = null;
      return logoCache;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = String(response.headers.get('content-type') || 'image/png').split(';')[0];
    if (!bytes.length || contentType.includes('svg')) {
      logoCache = null;
      return logoCache;
    }
    logoCache = { bytes, contentType: contentType || 'image/png' };
  } catch (error) {
    console.warn('[ses] Could not load email logo:', error?.message || error);
    logoCache = null;
  }
  return logoCache;
};

const buildRawEmail = ({
  toAddresses,
  subject,
  html,
  text,
  replyAddresses,
  logo,
}) => {
  const mixed = `rspuk-mixed-${Date.now()}`;
  const alt = `rspuk-alt-${Date.now()}`;
  const htmlWithCid = logo
    ? String(html).split(getEmailLogoUrl()).join(`cid:${EMAIL_LOGO_CID}`)
    : html;
  const lines = [
    `From: ${getSesFromAddress()}`,
    `To: ${toAddresses.join(', ')}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
  ];
  if (replyAddresses.length) {
    lines.push(`Reply-To: ${replyAddresses.join(', ')}`);
  }
  lines.push(`Content-Type: multipart/related; type="multipart/alternative"; boundary="${mixed}"`, '', `--${mixed}`);
  lines.push(`Content-Type: multipart/alternative; boundary="${alt}"`, '', `--${alt}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '', text || '', `--${alt}`);
  lines.push('Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '', htmlWithCid, `--${alt}--`);
  if (logo) {
    lines.push(`--${mixed}`);
    lines.push(`Content-Type: ${logo.contentType}; name="logo.png"`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push(`Content-ID: <${EMAIL_LOGO_CID}>`);
    lines.push('Content-Disposition: inline; filename="logo.png"', '');
    lines.push(foldBase64(logo.bytes.toString('base64')));
  }
  lines.push(`--${mixed}--`, '');
  return Buffer.from(lines.join('\r\n'), 'utf8');
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
  const replyAddresses = [replyToOverride, replyTo]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const shouldInlineLogo = htmlBody.includes(getEmailLogoUrl());
  const logo = shouldInlineLogo ? await loadEmailLogo() : null;

  if (logo) {
    await getClient().send(
      new SendRawEmailCommand({
        RawMessage: {
          Data: buildRawEmail({
            toAddresses,
            subject,
            html: htmlBody,
            text: textBody,
            replyAddresses,
            logo,
          }),
        },
      }),
    );
    return { sent: true };
  }

  const body = {};
  if (textBody) body.Text = { Data: textBody, Charset: 'UTF-8' };
  if (htmlBody) body.Html = { Data: htmlBody, Charset: 'UTF-8' };

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
