import mongoose from 'mongoose';

const variantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  stock: {
    type: Number,
    default: 0,
  },
  attributes: {
    size: String,
    color: String,
    material: String,
  },
});

const faqItemSchema = new mongoose.Schema({
  question: {
    type: String,
    trim: true,
    required: true,
  },
  answer: {
    type: String,
    trim: true,
    required: true,
  },
}, { _id: false });

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a product name'],
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  images: [{
    url: String,
    publicId: String,
  }],
  // Dedicated image field for third-party synced products (editable from admin)
  productImage: {
    url: { type: String, default: '' },
    publicId: { type: String, default: '' },
  },
  basePrice: {
    type: Number,
    required: true,
  },
  variants: [variantSchema],
  features: [String],
  faqs: [faqItemSchema],
  specifications: {
    dimensions: String,
    weight: String,
    material: String,
  },
  customizationOptions: {
    allowText: { type: Boolean, default: true },
    allowImage: { type: Boolean, default: true },
    allowQRCode: { type: Boolean, default: false },
    printAreas: [{
      name: String,
      width: Number,
      height: Number,
      x: Number,
      y: Number,
    }],
  },
  // Controls which CTAs appear on product detail page (design studio / upload design)
  uiOptions: {
    showEditorButton: { type: Boolean, default: true },
    showUploadDesignButton: { type: Boolean, default: true },
  },
  // Optional sizes for products that require selecting a size (e.g., boards, banners, posters)
  sizeOptions: {
    enabled: { type: Boolean, default: false },
    required: { type: Boolean, default: false },
    options: [
      {
        label: { type: String, trim: true },
        value: { type: String, trim: true },
      },
    ],
  },
  // Optional delivery pricing table (quantity x delivery speed)
  pricingTable: {
    enabled: { type: Boolean, default: false },
    quantities: [{ type: Number }],
    deliveryOptions: [
      {
        key: { type: String, trim: true },   // e.g. saver | standard | express
        label: { type: String, trim: true }, // e.g. Saver | Standard | Express
        etaDays: { type: Number },           // used to compute ETA label
        prices: [{ type: Number }],          // must align with quantities index
      },
    ],
  },
  source: {
    type: String,
    enum: ['local', 'third-party'],
    default: 'local',
    index: true,
  },
  thirdPartyProductKey: {
    type: String,
    default: null,
    trim: true,
  },
  thirdPartyAttributes: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isRecommended: {
    type: Boolean,
    default: false,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

const Product = mongoose.model('Product', productSchema);

export default Product;
