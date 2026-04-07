import mongoose from 'mongoose';

const quoteSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  country: {
    type: String,
    default: 'United Kingdom',
  },
  company: {
    type: String,
  },
  quoteType: {
    type: String,
    enum: ['standard', 'logo-artwork'],
    default: 'standard',
  },
  projectType: {
    type: String,
    required: true,
  },
  idealSignWidth: {
    type: String,
  },
  quantity: {
    type: String,
  },
  additionalInfo: {
    type: String,
  },
  message: {
    type: String,
  },
  artworkUrl: {
    type: String,
  },
  artworkPublicId: {
    type: String,
  },
  preferredContact: {
    type: String,
    enum: ['email', 'phone'],
    default: 'email',
  },
  status: {
    type: String,
    enum: ['new', 'contacted', 'quoted', 'converted', 'closed'],
    default: 'new',
  },
  adminResponse: {
    type: String,
  },
  customerReply: {
    type: String,
  },
  customerRepliedAt: {
    type: Date,
  },
  quotedPrice: {
    type: Number,
  },
  respondedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  respondedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

const Quote = mongoose.model('Quote', quoteSchema);

export default Quote;
