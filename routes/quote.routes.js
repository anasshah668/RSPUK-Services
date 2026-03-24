import express from 'express';
import { body, validationResult } from 'express-validator';
import sgMail from '@sendgrid/mail';
import Quote from '../models/Quote.js';
import { protect, admin } from '../middleware/auth.js';
import { upload, uploadToCloudinary } from '../config/cloudinary.js';

const router = express.Router();

// @route   POST /api/quotes
// @desc    Create new quote request
// @access  Public
router.post('/', upload.single('artwork'), [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('phone').notEmpty().withMessage('Phone is required'),
  body('projectType').notEmpty().withMessage('Project type is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const payload = { ...req.body };

    if (req.file?.buffer) {
      const uploadedArtwork = await uploadToCloudinary(req.file.buffer, 'printing-platform/quotes');
      payload.artworkUrl = uploadedArtwork.url;
      payload.artworkPublicId = uploadedArtwork.publicId;
    }

    const quote = await Quote.create(payload);
    res.status(201).json(quote);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/quotes
// @desc    Get all quotes (admin only)
// @access  Private/Admin
router.get('/', protect, admin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = status ? { status } : {};

    const quotes = await Quote.find(query)
      .populate('respondedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Quote.countDocuments(query);

    res.json({
      quotes,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/quotes/:id
// @desc    Get single quote
// @access  Private/Admin
router.get('/:id', protect, admin, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
      .populate('respondedBy', 'name email');

    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    res.json(quote);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/quotes/:id
// @desc    Update quote (admin response)
// @access  Private/Admin
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    quote.status = req.body.status || quote.status;
    quote.adminResponse = req.body.adminResponse || quote.adminResponse;
    quote.quotedPrice = req.body.quotedPrice || quote.quotedPrice;
    quote.respondedBy = req.user._id;
    quote.respondedAt = new Date();

    await quote.save();
    res.json(quote);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/quotes/:id/send-email
// @desc    Send quotation email to customer (admin only)
// @access  Private/Admin
router.post('/:id/send-email', protect, admin, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ message: 'Quote not found' });
    }

    if (!quote.email) {
      return res.status(400).json({ message: 'Customer email is missing for this quote' });
    }

    const sendGridApiKey = process.env.SENDGRID_API_KEY;
    const senderEmail = process.env.SENDGRID_FROM_EMAIL || process.env.MAIL_FROM;
    if (!sendGridApiKey || !senderEmail) {
      return res.status(500).json({ message: 'SendGrid is not configured on server' });
    }
    sgMail.setApiKey(sendGridApiKey);

    const responseText = req.body?.adminResponse || quote.adminResponse || '';
    const quotedPrice = req.body?.quotedPrice ?? quote.quotedPrice;
    const formattedPrice = quotedPrice !== undefined && quotedPrice !== null && quotedPrice !== ''
      ? `£${Number(quotedPrice).toFixed(2)}`
      : 'TBC';

    const subject = `Quotation for ${quote.projectType || 'your project'}`;

    // Build attractive, brandable HTML
    const brandName = process.env.BRAND_NAME || 'RSP';
    const brandPrimary = '#0ea5e9'; // blue-500
    const brandAccent = '#f59e0b';  // amber-500
    const brandLogo =
      process.env.BRAND_LOGO_URL ||
      `${process.env.APP_BASE_URL || ''}/logo.png`;

    const safe = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const responseHtml = String(responseText || '')
      .split('\n')
      .map(line => safe(line))
      .join('<br/>');

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${safe(subject)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body { margin:0; padding:0; background:#f5f7fb; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,'Helvetica Neue',Arial,'Noto Sans',sans-serif; color:#0f172a; }
    .container { width:100%; background:#f5f7fb; padding:24px 0; }
    .card { max-width:640px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 6px 20px rgba(15,23,42,.08); }
    .header { background:linear-gradient(135deg, ${brandPrimary}, #1e293b); padding:28px 28px 56px 28px; color:#ffffff; position:relative; }
    .header h1 { margin:0; font-size:22px; line-height:1.3; }
    .tag { display:inline-block; background:${brandAccent}; color:#0f172a; font-weight:700; font-size:11px; padding:6px 10px; border-radius:999px; margin-top:10px; letter-spacing:.3px; }
    .content { position:relative; top:-36px; padding:0 28px 28px 28px; }
    .panel { background:#ffffff; border:1px solid #e5e7eb; border-radius:14px; padding:18px; margin-bottom:16px; }
    .label { color:#64748b; font-size:12px; margin:0 0 4px 0; }
    .value { color:#0f172a; font-size:14px; margin:0; font-weight:600; }
    .divider { height:1px; background:#e5e7eb; margin:18px 0; }
    .price { font-size:28px; font-weight:800; color:${brandPrimary}; letter-spacing:.2px; }
    .cta { display:inline-block; background:${brandPrimary}; color:#ffffff; text-decoration:none; font-weight:700; font-size:14px; padding:12px 18px; border-radius:10px; }
    .muted { color:#64748b; font-size:12px; }
    .footer { max-width:640px; margin:18px auto 0; text-align:center; color:#64748b; font-size:12px; }
    .logo { width:120px; height:auto; display:block; margin:0 auto 8px; }
    .artwork { width:120px; height:120px; border-radius:12px; border:1px solid #e5e7eb; object-fit:cover; display:block; }
    @media (prefers-color-scheme: dark) {
      body { background:#0b1220; color:#e5e7eb; }
      .card { background:#0f172a; }
      .panel { background:#0b1220; border-color:#1f2937; }
      .label { color:#94a3b8; }
      .value { color:#e5e7eb; }
      .divider { background:#1f2937; }
      .footer { color:#94a3b8; }
    }
  </style>
 </head>
 <body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>Quotation for ${safe(quote.projectType || 'your project')}</h1>
        <div class="tag">${safe(brandName)} QUOTE</div>
      </div>
      <div class="content">
        <div class="panel">
          <p class="label">Hi ${safe(quote.name || 'Customer')},</p>
          <p class="value" style="font-weight:500;">
            Thank you for your enquiry. Please find your tailored quotation and details below.
          </p>
        </div>

        <div class="panel" style="display:flex; gap:16px; align-items:flex-start;">
          <div style="flex:1;">
            <p class="label">Quoted Price</p>
            <p class="price">${safe(formattedPrice)}</p>
          </div>
          ${quote.artworkUrl ? `
          <div>
            <p class="label" style="text-align:center;">Your Artwork</p>
            <a href="${safe(quote.artworkUrl)}" target="_blank" rel="noreferrer" style="text-decoration:none;">
              <img alt="Artwork" class="artwork" src="${safe(quote.artworkUrl)}" />
            </a>
            <p class="muted" style="text-align:center; margin-top:6px;">Click to open full image</p>
          </div>` : ``}
        </div>

        ${responseHtml ? `
        <div class="panel">
          <p class="label">Notes from our team</p>
          <p class="value" style="font-weight:500;">${responseHtml}</p>
        </div>` : ``}

        <div class="panel">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <p class="label">Project Type</p>
              <p class="value">${safe(quote.projectType || 'N/A')}</p>
            </div>
            <div>
              <p class="label">Quantity</p>
              <p class="value">${safe(quote.quantity || 'N/A')}</p>
            </div>
            <div>
              <p class="label">Ideal Sign Width</p>
              <p class="value">${safe(quote.idealSignWidth || 'N/A')}</p>
            </div>
            <div>
              <p class="label">Country</p>
              <p class="value">${safe(quote.country || 'United Kingdom')}</p>
            </div>
          </div>
          ${quote.additionalInfo ? `
          <div class="divider"></div>
          <p class="label">Additional Information</p>
          <p class="value" style="font-weight:500;">${safe(quote.additionalInfo)}</p>` : ``}
        </div>

        <div style="text-align:center; margin-top:8px;">
          <a class="cta" href="mailto:${safe(quote.email)}?subject=${encodeURIComponent('Re: ' + (quote.projectType || 'Quotation'))}">
            Reply to confirm
          </a>
          <p class="muted" style="margin-top:10px;">
            Want adjustments? Reply with your changes and we’ll update your quote.
          </p>
        </div>
      </div>
    </div>

    <div class="footer">
      <img class="logo" src="${safe(brandLogo)}" alt="${safe(brandName)} Logo" />
      <div style="margin-top:4px;">© ${new Date().getFullYear()} ${safe(brandName)}. All rights reserved.</div>
      <div class="muted" style="margin-top:6px;">
        This email was sent regarding your quotation request.
      </div>
    </div>
  </div>
 </body>
</html>
`;

    await sgMail.send({
      from: senderEmail,
      to: quote.email,
      subject,
      html,
    });

    quote.status = req.body?.status || quote.status || 'quoted';
    quote.adminResponse = responseText || quote.adminResponse;
    quote.quotedPrice = quotedPrice !== undefined && quotedPrice !== null && quotedPrice !== '' ? Number(quotedPrice) : quote.quotedPrice;
    quote.respondedBy = req.user._id;
    quote.respondedAt = new Date();
    await quote.save();

    res.json({ message: 'Quotation email sent successfully', quote });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
