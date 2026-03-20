const Product = require('../models/Product');
const Category = require('../models/Category');
const { getPlatformSettings, extractModerationFlags } = require('../utils/platform-settings');

exports.addProduct = async (req, res) => {
  try {
    const seller = req.user.id;
    const {
      name, category, ageYears, description, location,
      type,
      salePriceMin, salePriceMax,
      rentPricePerHour, rentPricePerDay, latePenaltyPerDay
    } = req.body;

    // Basic validation
    if (!name || !category || !ageYears || !description || !location || !type) {
      return res.status(400).json({ msg: 'Required fields missing' });
    }

    if (!['sale', 'rent'].includes(type)) {
      return res.status(400).json({ msg: 'Invalid product type' });
    }

    // Validate conditional fields
    if (type === 'sale') {
      if (!salePriceMin || !salePriceMax) {
        return res.status(400).json({ msg: 'Sale prices required' });
      }
      if (Number(salePriceMin) > Number(salePriceMax)) {
        return res.status(400).json({ msg: 'Min price cannot exceed max price' });
      }
    } else {
      if (!rentPricePerDay || !latePenaltyPerDay) {
        return res.status(400).json({ msg: 'Rent price & penalty required' });
      }
    }

    // Check category exists & active
    const cat = await Category.findById(category);
    if (!cat || cat.status !== 'active') {
      return res.status(400).json({ msg: 'Invalid or inactive category' });
    }

    const photos = req.files?.photos
      ? req.files.photos.map((f) => f.url || f.path).filter(Boolean)
      : [];
    const billPhotos = req.files?.billPhotos
      ? req.files.billPhotos.map((f) => f.url || f.path).filter(Boolean)
      : [];

    if (photos.length < 2 || photos.length > 5) {
      return res.status(400).json({ msg: 'Upload 2 to 5 product photos' });
    }

    const settings = await getPlatformSettings();
    const feePercentage = Number(cat.feePercentage ?? settings.defaultCommissionPercent ?? 10);
    const moderationFlags = extractModerationFlags(
      { name, description, location },
      settings.moderationKeywords
    );

    const product = await Product.create({
      seller,
      name,
      category,
      ageYears: Number(ageYears),
      description,
      location,
      type,
      salePriceMin: type === 'sale' ? Number(salePriceMin) : undefined,
      salePriceMax: type === 'sale' ? Number(salePriceMax) : undefined,
      rentPricePerHour:  type === 'rent' ? Number(rentPricePerHour)  : undefined,
      rentPricePerDay:   type === 'rent' ? Number(rentPricePerDay)   : undefined,
      latePenaltyPerDay: type === 'rent' ? Number(latePenaltyPerDay) : undefined,
      photos,
      billPhotos,
      status: 'pending',
      feePercentage,
      moderationStatus: moderationFlags.length ? 'flagged' : 'clean',
      moderationFlags
    });

    res.json({ msg: 'Product submitted for review', productId: product._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};
