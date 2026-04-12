import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema(
  {
    lineId: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: false },
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      sparse: true,
      unique: true,
    },
    guestClientId: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
    },
    items: [cartItemSchema],
  },
  { timestamps: true },
);

const Cart = mongoose.model('Cart', cartSchema);

export default Cart;
