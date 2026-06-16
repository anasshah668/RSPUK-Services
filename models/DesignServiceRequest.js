import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    originalName: { type: String, default: '' },
    resourceType: { type: String, default: 'image' },
  },
  { _id: false },
);

const deliverableSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    originalName: { type: String, default: '' },
    resourceType: { type: String, default: 'image' },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false },
);

const designServiceRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    brief: {
      type: String,
      required: true,
      trim: true,
    },
    productType: {
      type: String,
      trim: true,
      default: '',
    },
    referenceFiles: [fileSchema],
    priceAmount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'GBP',
    },
    vatInclusive: {
      type: Boolean,
      default: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    paymentId: { type: String, default: '' },
    orderReference: { type: String, default: '' },
    trackingId: { type: String, default: '' },
    status: {
      type: String,
      enum: ['awaiting_payment', 'paid', 'in_progress', 'delivered', 'cancelled'],
      default: 'awaiting_payment',
    },
    deliverables: [deliverableSchema],
    adminNotes: { type: String, default: '' },
    customerName: { type: String, default: '' },
    customerEmail: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
  },
  { timestamps: true },
);

const DesignServiceRequest = mongoose.model('DesignServiceRequest', designServiceRequestSchema);

export default DesignServiceRequest;
