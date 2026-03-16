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
  company: {
    type: String,
  },
  projectType: {
    type: String,
    required: true,
  },
  quantity: {
    type: String,
  },
  message: {
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
