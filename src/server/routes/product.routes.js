const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { buildMulter, prepareUploads } = require('../utils/upload');

const { verifyToken, isAdmin } = require('../middleware/auth.middleware');
const Product = require('../models/Product');
const Rental = require('../models/Rental');
const Offer = require('../models/Offer');
const Category = require('../models/Category');
const { addProduct } = require('../controllers/product.controller');
const { getPlatformSettings, extractModerationFlags } = require('../utils/platform-settings');
const { logAdminAudit } = require('../utils/admin-audit');

const upload = buildMulter('products', 5 * 1024 * 1024);

router.post(
  '/',
  verifyToken,
  upload.fields([
    { name: 'photos', maxCount: 5 },
    { name: 'billPhotos', maxCount: 2 }
  ]),
  prepareUploads('products'),
  addProduct
);

router.get('/user', verifyToken, async (req, res) => {
  try {
    const products = await Product.find({ seller: req.user.id })
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.json(products);
  } catch (error) {
    console.error('Error fetching user products:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.get('/user/:id', verifyToken, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      seller: req.user.id
    })
      .populate('category', 'name status')
      .lean();

    if (!product) {
      return res.status(404).json({
        msg: 'Product not found or does not belong to you'
      });
    }

    res.json(product);
  } catch (error) {
    console.error('Error fetching single user product:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.put('/user/:id', verifyToken, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      seller: req.user.id
    });

    if (!product) {
      return res.status(404).json({
        msg: 'Product not found or does not belong to you'
      });
    }

    const allowedFields = [
      'name',
      'category',
      'ageYears',
      'description',
      'location',
      'type',
      'salePriceMin',
      'salePriceMax',
      'rentPricePerHour',
      'rentPricePerDay',
      'latePenaltyPerDay'
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        product[field] = req.body[field];
      }
    });

    if (product.type === 'sale') {
      if (!product.salePriceMin || !product.salePriceMax) {
        return res.status(400).json({
          msg: 'Sale prices (min and max) are required for sale type'
        });
      }
      if (Number(product.salePriceMin) > Number(product.salePriceMax)) {
        return res.status(400).json({
          msg: 'Minimum sale price cannot be greater than maximum'
        });
      }
    } else if (product.type === 'rent') {
      if (!product.rentPricePerDay || !product.latePenaltyPerDay) {
        return res.status(400).json({
          msg: 'Rent price per day and late penalty are required for rent type'
        });
      }
    }

    const [categoryDoc, settings] = await Promise.all([
      Category.findById(product.category).select('feePercentage').lean(),
      getPlatformSettings()
    ]);

    product.feePercentage = Number(categoryDoc?.feePercentage ?? settings.defaultCommissionPercent ?? 10);

    const moderationFlags = extractModerationFlags(
      {
        name: product.name,
        description: product.description,
        location: product.location
      },
      settings.moderationKeywords
    );
    product.moderationFlags = moderationFlags;
    product.moderationStatus = moderationFlags.length ? 'flagged' : 'clean';

    await product.save();

    res.status(200).json({
      msg: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Error updating user product:', error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        msg: 'Validation failed',
        errors: Object.values(error.errors).map((e) => e.message)
      });
    }

    res.status(500).json({ msg: 'Server error while updating product' });
  }
});

router.get('/admin/pending', verifyToken, isAdmin, async (req, res) => {
  try {
    const products = await Product.find({ status: 'pending' })
      .populate('seller', 'firstName lastName email')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(products);
  } catch (error) {
    console.error('Error fetching pending products:', error);
    res.status(500).json({ msg: 'Server error while fetching pending products' });
  }
});

router.get('/admin/all', verifyToken, isAdmin, async (req, res) => {
  try {
    const products = await Product.find()
      .populate('seller', 'firstName lastName email')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(products);
  } catch (error) {
    console.error('Error fetching all products:', error);
    res.status(500).json({ msg: 'Server error while fetching all products' });
  }
});

router.get('/admin/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('seller', 'firstName lastName email')
      .populate('category', 'name')
      .lean();

    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }

    res.status(200).json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ msg: 'Server error fetching product' });
  }
});

router.put('/admin/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const before = await Product.findById(req.params.id).lean();
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }

    await logAdminAudit(req, {
      action: 'PRODUCT_UPDATED',
      entityType: 'product',
      entityId: product._id,
      summary: `Updated product "${product.name}"`,
      before: before || null,
      after: {
        name: product.name,
        status: product.status,
        type: product.type
      }
    });

    res.status(200).json({
      msg: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(400).json({ msg: error.message || 'Validation error or server error' });
  }
});

router.put('/admin/:id/status', verifyToken, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ msg: 'Invalid status. Use "approved" or "rejected"' });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }

    if (status === 'approved') {
      let basePrice = 0;
      if (product.type === 'sale') {
        basePrice = (product.salePriceMin + product.salePriceMax) / 2;
      } else if (product.type === 'rent') {
        basePrice = product.rentPricePerDay;
      }

      if (basePrice <= 0) {
        return res.status(400).json({ msg: 'Cannot calculate fee: invalid price' });
      }

      const [categoryDoc, settings] = await Promise.all([
        Category.findById(product.category).select('feePercentage').lean(),
        getPlatformSettings()
      ]);
      const feePercentage = Number(categoryDoc?.feePercentage ?? settings.defaultCommissionPercent ?? 10);
      const platformFee = (basePrice * feePercentage) / 100;
      const sellerPayout = basePrice - platformFee;

      product.feePercentage = feePercentage;
      product.platformFee = platformFee;
      product.sellerPayout = sellerPayout;
    }

    product.status = status;
    await product.save();
    await logAdminAudit(req, {
      action: 'PRODUCT_STATUS_CHANGED',
      entityType: 'product',
      entityId: product._id,
      summary: `Set product "${product.name}" status to ${status}`,
      after: {
        status: product.status,
        feePercentage: Number(product.feePercentage || 0),
        platformFee: Number(product.platformFee || 0),
        sellerPayout: Number(product.sellerPayout || 0)
      }
    });

    res.status(200).json({
      msg: `Product ${status} successfully`,
      product
    });
  } catch (error) {
    console.error('Error updating product status:', error);
    res.status(500).json({ msg: 'Server error while updating product status' });
  }
});

router.delete('/admin/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }

    if (product.photos?.length) {
      product.photos.forEach((photo) => {
        try {
          if (typeof photo === 'string' && photo.startsWith('http')) {
            return;
          }
          const filePath = path.join(process.cwd(), photo);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (unlinkErr) {
          console.error('Failed to delete photo:', unlinkErr);
        }
      });
    }

    if (product.billPhotos?.length) {
      product.billPhotos.forEach((bill) => {
        try {
          if (typeof bill === 'string' && bill.startsWith('http')) {
            return;
          }
          const filePath = path.join(process.cwd(), bill);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (unlinkErr) {
          console.error('Failed to delete bill photo:', unlinkErr);
        }
      });
    }

    await logAdminAudit(req, {
      action: 'PRODUCT_DELETED',
      entityType: 'product',
      entityId: product._id,
      summary: `Deleted product "${product.name}"`,
      before: {
        name: product.name,
        status: product.status,
        type: product.type,
        seller: product.seller
      }
    });

    res.status(200).json({ msg: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ msg: 'Server error while deleting product' });
  }
});

router.get('/approved', async (req, res) => {
  try {
    const {
      q = '',
      category = '',
      type = '',
      location = '',
      minPrice = '',
      maxPrice = '',
      minAge = '',
      maxAge = '',
      sort = 'newest',
      page = '1',
      limit = '12'
    } = req.query;

    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedLimit = Math.min(48, Math.max(1, Number(limit) || 12));

    const query = {
      status: 'approved',
      isActive: true
    };

    if (category) {
      query.category = category;
    }

    if (type && ['sale', 'rent'].includes(String(type).toLowerCase())) {
      query.type = String(type).toLowerCase();
    }

    const searchValue = String(q || '').trim();
    if (searchValue) {
      const regex = new RegExp(searchValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ name: regex }, { description: regex }, { location: regex }];
    }

    const products = await Product.find(query)
      .populate('seller', 'firstName lastName')
      .populate('category', 'name')
      .lean();

    if (sort === 'oldest') {
      products.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sort === 'price_asc' || sort === 'price_desc') {
      const toPrice = (p) =>
        p.type === 'sale'
          ? Number(p.salePriceMin || p.salePriceMax || 0)
          : Number(p.rentPricePerDay || p.rentPricePerHour || 0);
      products.sort((a, b) => {
        const diff = toPrice(a) - toPrice(b);
        return sort === 'price_asc' ? diff : -diff;
      });
    } else {
      products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const locationValue = String(location || '').trim().toLowerCase();
    const minPriceRaw = String(minPrice || '').trim();
    const maxPriceRaw = String(maxPrice || '').trim();
    const minAgeRaw = String(minAge || '').trim();
    const maxAgeRaw = String(maxAge || '').trim();
    const minPriceValue = Number(minPriceRaw);
    const maxPriceValue = Number(maxPriceRaw);
    const minAgeValue = Number(minAgeRaw);
    const maxAgeValue = Number(maxAgeRaw);
    const hasMinPrice = minPriceRaw !== '' && Number.isFinite(minPriceValue) && minPriceValue >= 0;
    const hasMaxPrice = maxPriceRaw !== '' && Number.isFinite(maxPriceValue) && maxPriceValue >= 0;
    const hasMinAge = minAgeRaw !== '' && Number.isFinite(minAgeValue) && minAgeValue >= 0;
    const hasMaxAge = maxAgeRaw !== '' && Number.isFinite(maxAgeValue) && maxAgeValue >= 0;

    const toFilterPrice = (p) =>
      p.type === 'sale'
        ? Number(p.salePriceMin || p.salePriceMax || 0)
        : Number(p.rentPricePerDay || p.rentPricePerHour || 0);

    const filteredProducts = products.filter((p) => {
      if (locationValue) {
        const productLocation = String(p.location || '').toLowerCase();
        if (!productLocation.includes(locationValue)) {
          return false;
        }
      }

      const price = toFilterPrice(p);
      if (hasMinPrice && price < minPriceValue) {
        return false;
      }
      if (hasMaxPrice && price > maxPriceValue) {
        return false;
      }

      const age = Number(p.ageYears || 0);
      if (hasMinAge && age < minAgeValue) {
        return false;
      }
      if (hasMaxAge && age > maxAgeValue) {
        return false;
      }

      return true;
    });

    const total = filteredProducts.length;
    const startIndex = (parsedPage - 1) * parsedLimit;
    const items = filteredProducts.slice(startIndex, startIndex + parsedLimit);

    res.status(200).json({
      items,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.max(1, Math.ceil(total / parsedLimit))
    });
  } catch (error) {
    console.error('Error fetching approved products:', error);
    res.status(500).json({ msg: 'Server error while fetching approved products' });
  }
});

router.patch('/user/:id/toggle-active', verifyToken, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      seller: req.user.id
    });

    if (!product) {
      return res.status(404).json({ msg: 'Product not found or not yours' });
    }

    if (product.status !== 'approved') {
      return res.status(400).json({ msg: 'Only approved products can be paused/activated' });
    }

    product.isActive = !product.isActive;
    await product.save();

    res.json({
      msg: product.isActive ? 'Product activated' : 'Product paused',
      isActive: product.isActive
    });
  } catch (error) {
    console.error('Toggle active error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.get('/:id/rental-availability', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const product = await Product.findById(req.params.id).select('_id type status isActive').lean();

    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }

    if (product.type !== 'rent') {
      return res.json({ available: false, reason: 'This product is not for rent', conflicts: [] });
    }

    if (product.status !== 'approved' || !product.isActive) {
      return res.json({ available: false, reason: 'Product is not currently available', conflicts: [] });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ msg: 'startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ msg: 'Invalid date format' });
    }
    if (start >= end) {
      return res.status(400).json({ msg: 'startDate must be before endDate' });
    }

    const rentalConflicts = await Rental.find({
      productId: product._id,
      startDate: { $lt: end },
      endDate: { $gt: start },
      returnStatus: { $ne: 'RETURNED' }
    })
      .select('_id startDate endDate')
      .lean();

    const offerConflicts = await Offer.find({
      productId: product._id,
      status: { $in: ['APPROVED', 'ACCEPTED'] },
      rentStartDate: { $lt: end },
      rentEndDate: { $gt: start }
    })
      .select('_id rentStartDate rentEndDate')
      .lean();

    const conflicts = [
      ...rentalConflicts.map((c) => ({
        source: 'rental',
        id: c._id,
        startDate: c.startDate,
        endDate: c.endDate
      })),
      ...offerConflicts.map((c) => ({
        source: 'offer',
        id: c._id,
        startDate: c.rentStartDate,
        endDate: c.rentEndDate
      }))
    ];

    res.json({
      available: conflicts.length === 0,
      conflicts
    });
  } catch (error) {
    console.error('Error checking rental availability:', error);
    res.status(500).json({ msg: 'Server error while checking availability' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      status: 'approved',
      isActive: true
    })
      .populate('category', 'name')
      .populate('seller', 'firstName lastName')
      .lean();

    if (!product) {
      return res.status(404).json({
        msg: 'Product not found, not approved, or currently unavailable'
      });
    }

    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
