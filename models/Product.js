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
  basePrice: {
    type: Number,
    required: true,
  },
  variants: [variantSchema],
  features: [String],
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
  isActive: {
    type: Boolean,
    default: true,
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
