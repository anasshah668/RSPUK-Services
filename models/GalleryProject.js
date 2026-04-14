import mongoose from 'mongoose';

const galleryImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const galleryProjectSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 4000,
    },
    images: {
      type: [galleryImageSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  { timestamps: true }
);

const GalleryProject = mongoose.model('GalleryProject', galleryProjectSchema);

export default GalleryProject;
