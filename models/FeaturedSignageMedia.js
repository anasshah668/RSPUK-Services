import mongoose from 'mongoose';

const featuredImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, default: '', trim: true },
  },
  { _id: false },
);

const featuredSignageMediaSchema = new mongoose.Schema(
  {
    categorySlug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    images: {
      type: [featuredImageSchema],
      default: [],
    },
  },
  { timestamps: true },
);

const FeaturedSignageMedia = mongoose.model(
  'FeaturedSignageMedia',
  featuredSignageMediaSchema,
);

export default FeaturedSignageMedia;
