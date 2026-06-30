import express from "express";
import { body, validationResult } from "express-validator";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import sgMail from "@sendgrid/mail";
import crypto from "crypto";
import User from "../models/User.js";
import SignupOtp from "../models/SignupOtp.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const SIGNUP_OTP_TTL_MS = 10 * 60 * 1000;

const generateOtpCode = () =>
  String(Math.floor(100000 + Math.random() * 900000));

const sendSignupOtpEmail = async ({ email, otp, name }) => {
  const sendGridApiKey = process.env.SENDGRID_API_KEY;
  const senderEmail = process.env.SENDGRID_FROM_EMAIL || process.env.MAIL_FROM;

  const subject = "Your River Sign & Printing One-Time Password";
  const logoUrl = `${frontendUrl.replace(/\/+$/, "")}/logo.png`;
  const html = `
    <div style="background:#f4f6fb;padding:24px 0;font-family:Arial,sans-serif;color:#111827">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <tr>
          <td style="background:linear-gradient(90deg,#1d4ed8,#2563eb);padding:18px 24px;color:#ffffff">
            <img src="${logoUrl}" alt="Tiver Sign & Printing" style="height:44px;max-width:180px;object-fit:contain;display:block;margin-bottom:10px" />
            <h2 style="margin:0;font-size:20px;font-weight:700">Tiver Sign &amp; Printing</h2>
            <p style="margin:6px 0 0;font-size:13px;opacity:0.95">Secure Account Verification</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px">
            <p style="margin:0 0 12px;font-size:15px">Hello ${name || "there"},</p>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.7">
              Glad you are interested in <strong>Tiver Sign and PRINTING</strong>. Here is your one-time password:
            </p>
            <div style="margin:18px 0;padding:14px 18px;background:#eff6ff;border:1px dashed #60a5fa;border-radius:10px;text-align:center">
              <span style="font-size:30px;letter-spacing:6px;font-weight:700;color:#1d4ed8">${otp}</span>
            </div>
            <p style="margin:0 0 10px;font-size:14px;color:#374151">
              This code will expire in <strong>10 minutes</strong>.
            </p>
            <p style="margin:0;font-size:12px;color:#6b7280">
              If you did not request this, please ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </div>
  `;

  if (!sendGridApiKey || !senderEmail) {
    console.log(`[Signup OTP] ${email} -> ${otp}`);
    return;
  }

  sgMail.setApiKey(sendGridApiKey);
  await sgMail.send({
    to: email,
    from: senderEmail,
    subject,
    html,
  });
};

const sendPasswordResetEmail = async ({ email, name, resetToken, context }) => {
  const sendGridApiKey = process.env.SENDGRID_API_KEY;
  const senderEmail = process.env.SENDGRID_FROM_EMAIL || process.env.MAIL_FROM;
  const isAdmin = context === "admin";
  const resetPath = isAdmin ? "/admin/reset-password" : "/reset-password";
  const resetUrl = `${frontendUrl.replace(/\/+$/, "")}${resetPath}?token=${encodeURIComponent(resetToken)}`;
  const subject = isAdmin
    ? "Reset your admin password — River Sign & Printing"
    : "Reset your password — River Sign & Printing";
  const logoUrl = `${frontendUrl.replace(/\/+$/, "")}/logo.png`;
  const html = `
    <div style="background:#f4f6fb;padding:24px 0;font-family:Arial,sans-serif;color:#111827">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <tr>
          <td style="background:linear-gradient(90deg,#1d4ed8,#2563eb);padding:18px 24px;color:#ffffff">
            <img src="${logoUrl}" alt="River Sign & Printing" style="height:44px;max-width:180px;object-fit:contain;display:block;margin-bottom:10px" />
            <h2 style="margin:0;font-size:20px;font-weight:700">River Sign &amp; Printing</h2>
            <p style="margin:6px 0 0;font-size:13px;opacity:0.95">${isAdmin ? "Admin password reset" : "Password reset"}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px">
            <p style="margin:0 0 12px;font-size:15px">Hello ${name || "there"},</p>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.7">
              We received a request to reset your ${isAdmin ? "admin " : ""}password. Click the button below to choose a new password.
            </p>
            <p style="margin:20px 0;text-align:center">
              <a href="${resetUrl}" style="display:inline-block;padding:12px 22px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700">Reset password</a>
            </p>
            <p style="margin:0 0 10px;font-size:13px;color:#374151;line-height:1.6">
              Or copy this link into your browser:<br />
              <a href="${resetUrl}" style="color:#2563eb;word-break:break-all">${resetUrl}</a>
            </p>
            <p style="margin:16px 0 0;font-size:12px;color:#6b7280">
              This link expires in <strong>1 hour</strong>. If you did not request a reset, you can ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </div>
  `;

  if (!sendGridApiKey || !senderEmail) {
    console.log(`[Password reset] ${email} -> ${resetUrl}`);
    return { sent: false, devResetUrl: resetUrl };
  }

  sgMail.setApiKey(sendGridApiKey);
  await sgMail.send({
    to: email,
    from: senderEmail,
    subject,
    html,
  });
  return { sent: true };
};

// Configure Google strategy once.
if (
  !passport._strategy("google") &&
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET
) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/api/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) {
            return done(new Error("Google account does not provide an email"));
          }

          let user = await User.findOne({
            $or: [{ provider: "google", providerId: profile.id }, { email }],
          });

          if (!user) {
            user = await User.create({
              name: profile.displayName || "Google User",
              email,
              provider: "google",
              providerId: profile.id,
              avatar: profile.photos?.[0]?.value,
            });
          } else if (user.provider !== "google") {
            user.provider = "google";
            user.providerId = profile.id;
            if (!user.avatar && profile.photos?.[0]?.value) {
              user.avatar = profile.photos[0].value;
            }
            await user.save();
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      },
    ),
  );
}

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post(
  "/register",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Please provide a valid email"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, email, password } = req.body;

      const userExists = await User.findOne({ email });
      if (userExists) {
        return res.status(400).json({ message: "User already exists" });
      }

      const user = await User.create({
        name,
        email,
        password,
        provider: "local",
      });

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: user.generateToken(),
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
);

// @route   POST /api/auth/register/send-otp
// @desc    Send OTP to email for signup
// @access  Public
router.post(
  "/register/send-otp",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Please provide a valid email"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const name = String(req.body.name || "").trim();
      const email = String(req.body.email || "")
        .toLowerCase()
        .trim();
      const password = String(req.body.password || "");

      const userExists = await User.findOne({ email });
      if (userExists) {
        return res.status(400).json({ message: "User already exists" });
      }

      const otp = generateOtpCode();
      const expiresAt = new Date(Date.now() + SIGNUP_OTP_TTL_MS);
      await SignupOtp.findOneAndUpdate(
        { email },
        {
          $set: {
            email,
            otp,
            name,
            password,
            expiresAt,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      await sendSignupOtpEmail({ email, otp, name });

      return res.json({
        success: true,
        message: "OTP sent to your email.",
        expiresInSeconds: Math.floor(SIGNUP_OTP_TTL_MS / 1000),
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  },
);

// @route   POST /api/auth/register/verify-otp
// @desc    Verify OTP and create account
// @access  Public
router.post(
  "/register/verify-otp",
  [
    body("email").isEmail().withMessage("Please provide a valid email"),
    body("otp").isLength({ min: 4 }).withMessage("OTP is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const email = String(req.body.email || "")
        .toLowerCase()
        .trim();
      const otp = String(req.body.otp || "").trim();
      const stored = await SignupOtp.findOne({ email });

      if (!stored) {
        return res
          .status(400)
          .json({ message: "OTP not found. Please request a new code." });
      }
      if (new Date() > stored.expiresAt) {
        await SignupOtp.deleteOne({ email });
        return res
          .status(400)
          .json({ message: "OTP expired. Please request a new code." });
      }
      if (String(stored.otp) !== otp) {
        return res.status(400).json({ message: "Invalid OTP" });
      }

      const userExists = await User.findOne({ email });
      if (userExists) {
        await SignupOtp.deleteOne({ email });
        return res.status(400).json({ message: "User already exists" });
      }

      const user = await User.create({
        name: stored.name,
        email,
        password: stored.password,
        provider: "local",
      });

      await SignupOtp.deleteOne({ email });
      return res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: user.generateToken(),
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  },
);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Please provide a valid email"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      const user = await User.findOne({ email }).select("+password");
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (user.provider !== "local") {
        return res
          .status(401)
          .json({ message: `Please sign in with ${user.provider}` });
      }

      const isMatch = await user.matchPassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: user.generateToken(),
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
);

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      phone: user.phone,
      address: user.address,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Request password reset email
// @access  Public
router.post(
  "/forgot-password",
  [
    body("email").isEmail().withMessage("Please provide a valid email"),
    body("context").optional().isIn(["admin", "user"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const email = String(req.body.email || "").trim().toLowerCase();
      const context = req.body.context === "admin" ? "admin" : "user";
      const genericMessage =
        "If an account with that email exists, a password reset link has been sent.";

      const user = await User.findOne({ email });
      if (!user) {
        return res.json({ message: genericMessage });
      }

      const isAdminRequest = context === "admin";
      if (isAdminRequest && user.role !== "admin") {
        return res.json({ message: genericMessage });
      }

      const resetToken = user.createPasswordResetToken();
      await user.save({ validateBeforeSave: false });

      try {
        await sendPasswordResetEmail({
          email: user.email,
          name: user.name,
          resetToken,
          context,
        });
      } catch (mailErr) {
        console.error("[forgot-password] Email failed", mailErr);
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save({ validateBeforeSave: false });
        return res.status(500).json({
          message: "Could not send reset email. Please try again later.",
        });
      }

      res.json({ message: genericMessage });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
);

// @route   POST /api/auth/reset-password
// @desc    Reset password using email token
// @access  Public
router.post(
  "/reset-password",
  [
    body("token").notEmpty().withMessage("Reset token is required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { token, password } = req.body;
      const hashedToken = crypto.createHash("sha256").update(String(token)).digest("hex");

      const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() },
      }).select("+passwordResetToken +passwordResetExpires +password");

      if (!user) {
        return res.status(400).json({
          message: "Invalid or expired reset link. Please request a new one.",
        });
      }

      user.password = password;
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      if (!user.provider || user.provider === "google") {
        user.provider = "local";
      }
      await user.save();

      res.json({ message: "Password reset successfully. You can now sign in." });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
);

// @route   GET /api/auth/google
// @desc    Start Google OAuth login/signup flow
// @access  Public
router.get("/google", (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ message: "Google OAuth is not configured" });
  }

  return passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
    prompt: "select_account",
  })(req, res, next);
});

// @route   GET /api/auth/google/callback
// @desc    Google OAuth callback
// @access  Public
router.get("/google/callback", (req, res, next) => {
  passport.authenticate("google", { session: false }, (error, user) => {
    if (error || !user) {
      return res.redirect(`${frontendUrl}/login?oauthError=google_auth_failed`);
    }

    const token = user.generateToken();
    const redirectUrl = `${frontendUrl}/oauth-callback?token=${encodeURIComponent(token)}`;
    return res.redirect(redirectUrl);
  })(req, res, next);
});

// Change password (private)
router.post(
  "/change-password",
  protect,
  [
    body("currentPassword")
      .notEmpty()
      .withMessage("Current password is required"),
    body("newPassword")
      .isLength({ min: 6 })
      .withMessage("New password must be at least 6 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { currentPassword, newPassword } = req.body;
      const user = await User.findById(req.user._id).select("+password");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const isMatch = await user.matchPassword(currentPassword);
      if (!isMatch) {
        return res
          .status(400)
          .json({ message: "Current password is incorrect" });
      }

      user.password = newPassword;
      await user.save();

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
);

export default router;
