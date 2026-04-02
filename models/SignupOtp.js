import mongoose from 'mongoose';

const signupOtpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    otp: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Auto-delete expired OTP records.
signupOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const SignupOtp = mongoose.model('SignupOtp', signupOtpSchema);

export default SignupOtp;
