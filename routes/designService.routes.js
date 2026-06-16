import express from 'express';
import { body, validationResult } from 'express-validator';
import DesignServiceRequest from '../models/DesignServiceRequest.js';
import { protect, admin } from '../middleware/auth.js';
import { artworkUpload, uploadArtworkToCloudinary } from '../config/cloudinary.js';
import { getDesignServicePrice } from '../services/designServicePrice.js';

const router = express.Router();

const trim = (value) => String(value ?? '').trim();

router.get('/price', async (_req, res) => {
  try {
    res.json(await getDesignServicePrice());
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load price' });
  }
});

router.get('/my', protect, async (req, res) => {
  try {
    const requests = await DesignServiceRequest.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ requests });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load design requests' });
  }
});

router.post(
  '/',
  protect,
  (req, res, next) => {
    artworkUpload.array('referenceFiles', 5)(req, res, (err) => {
      if (err) {
        const status = err?.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ message: err.message });
      }
      next();
    });
  },
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('brief').trim().notEmpty().withMessage('Brief is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const pricing = await getDesignServicePrice();
      const referenceFiles = [];

      if (Array.isArray(req.files)) {
        for (const file of req.files) {
          const uploaded = await uploadArtworkToCloudinary(
            file.buffer,
            file.originalname,
            'printing-platform/design-service/references',
          );
          referenceFiles.push({
            url: uploaded.url,
            publicId: uploaded.publicId,
            originalName: uploaded.originalFilename || file.originalname || '',
            resourceType: uploaded.resourceType || 'image',
          });
        }
      }

      const requestDoc = await DesignServiceRequest.create({
        user: req.user._id,
        title: trim(req.body.title),
        brief: trim(req.body.brief),
        productType: trim(req.body.productType),
        referenceFiles,
        priceAmount: pricing.price,
        currency: pricing.currency,
        vatInclusive: pricing.vatInclusive,
        customerName: trim(req.user.name),
        customerEmail: trim(req.user.email),
        customerPhone: trim(req.user.phone),
        paymentStatus: 'pending',
        status: 'awaiting_payment',
      });

      res.status(201).json(requestDoc);
    } catch (error) {
      res.status(500).json({ message: error.message || 'Failed to create design request' });
    }
  },
);

router.get('/admin/all', protect, admin, async (req, res) => {
  try {
    const { status, paymentStatus } = req.query;
    const query = {};
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;

    const requests = await DesignServiceRequest.find(query)
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ requests });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load design requests' });
  }
});

router.patch('/admin/:id', protect, admin, async (req, res) => {
  try {
    const { status, adminNotes } = req.body || {};
    const allowed = ['paid', 'in_progress', 'delivered', 'cancelled'];
    const update = {};

    if (status !== undefined) {
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      update.status = status;
    }
    if (adminNotes !== undefined) {
      update.adminNotes = trim(adminNotes);
    }

    const requestDoc = await DesignServiceRequest.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true },
    ).populate('user', 'name email phone');

    if (!requestDoc) {
      return res.status(404).json({ message: 'Design request not found' });
    }

    res.json(requestDoc);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to update design request' });
  }
});

router.post(
  '/admin/:id/deliverable',
  protect,
  admin,
  (req, res, next) => {
    artworkUpload.single('file')(req, res, (err) => {
      if (err) {
        const status = err?.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ message: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'Deliverable file is required' });
      }

      const requestDoc = await DesignServiceRequest.findById(req.params.id);
      if (!requestDoc) {
        return res.status(404).json({ message: 'Design request not found' });
      }

      const uploaded = await uploadArtworkToCloudinary(
        req.file.buffer,
        req.file.originalname,
        `printing-platform/design-service/deliverables/${requestDoc._id}`,
      );

      const deliverable = {
        url: uploaded.url,
        publicId: uploaded.publicId,
        originalName: uploaded.originalFilename || req.file.originalname || '',
        resourceType: uploaded.resourceType || 'image',
        uploadedAt: new Date(),
        uploadedBy: req.user._id,
      };

      requestDoc.deliverables.push(deliverable);
      requestDoc.status = 'delivered';
      await requestDoc.save();

      res.json(requestDoc);
    } catch (error) {
      res.status(500).json({ message: error.message || 'Failed to upload deliverable' });
    }
  },
);

router.get('/:id', protect, async (req, res) => {
  try {
    const requestDoc = await DesignServiceRequest.findById(req.params.id)
      .populate('user', 'name email phone')
      .lean();

    if (!requestDoc) {
      return res.status(404).json({ message: 'Design request not found' });
    }

    const isOwner = String(requestDoc.user?._id || requestDoc.user) === String(req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(requestDoc);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load design request' });
  }
});

export default router;
