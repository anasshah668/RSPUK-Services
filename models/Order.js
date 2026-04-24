import mongoose from 'mongoose';

const designSchema = new mongoose.Schema({
  canvasData: {
    type: String, // JSON string of Fabric.js canvas
  },
  previewImage: {
    type: String, // URL to preview image
  },
  designFile: {
    type: String, // URL to design file
  },
});

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  variant: {
    type: Object,
  },
  quantity: {
    type: Number,
    required: true,
    default: 1,
  },
  price: {
    type: Number,
    required: true,
  },
  design: designSchema,
  customization: {
    type: Object,
  },
});

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  items: [orderItemSchema],
  shippingAddress: {
    name: String,
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    phone: String,
  },
  billingAddress: {
    name: String,
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
  },
  subtotal: {
    type: Number,
    required: true,
  },
  shippingCost: {
    type: Number,
    default: 0,
  },
  tax: {
    type: Number,
    default: 0,
  },
  total: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending',
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
  },
  paymentMethod: {
    type: String,
  },
  paymentId: {
    type: String,
  },
  trackingNumber: {
    type: String,
  },
  /** Paid checkout / basket snapshot when `items` is empty or for fulfilment notes (Worldpay, etc.). */
  checkoutContext: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined,
  },
}, {
  timestamps: true,
});

const Order = mongoose.model('Order', orderSchema);

export default Order;
