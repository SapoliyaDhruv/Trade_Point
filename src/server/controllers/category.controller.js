const Category = require('../models/Category');
const { logAdminAudit } = require('../utils/admin-audit');

exports.addCategory = async (req, res) => {
  try {
    const { name, feePercentage } = req.body;

    if (!name) return res.status(400).json({ msg: 'Category name required' });
    if (feePercentage !== undefined && (Number.isNaN(Number(feePercentage)) || Number(feePercentage) < 0 || Number(feePercentage) > 100)) {
      return res.status(400).json({ msg: 'Fee percentage must be between 0 and 100' });
    }

    const exists = await Category.findOne({ name });
    if (exists) return res.status(400).json({ msg: 'Category already exists' });

    const category = await Category.create({
      name,
      feePercentage: feePercentage === undefined ? 10 : Number(feePercentage)
    });
    await logAdminAudit(req, {
      action: 'CATEGORY_CREATED',
      entityType: 'category',
      entityId: category._id,
      summary: `Created category "${category.name}"`,
      after: {
        name: category.name,
        feePercentage: Number(category.feePercentage || 0),
        status: category.status
      }
    });
    res.json({ msg: 'Category added', category });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { name, status, feePercentage } = req.body;

    if (feePercentage !== undefined && (Number.isNaN(Number(feePercentage)) || Number(feePercentage) < 0 || Number(feePercentage) > 100)) {
      return res.status(400).json({ msg: 'Fee percentage must be between 0 and 100' });
    }

    const update = {};
    if (name !== undefined) update.name = name;
    if (status !== undefined) update.status = status;
    if (feePercentage !== undefined) update.feePercentage = Number(feePercentage);

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );
    await logAdminAudit(req, {
      action: 'CATEGORY_UPDATED',
      entityType: 'category',
      entityId: req.params.id,
      summary: `Updated category "${category?.name || req.params.id}"`,
      after: update
    });

    res.json({ msg: 'Category updated', category });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).lean();
    await Category.findByIdAndDelete(req.params.id);
    await logAdminAudit(req, {
      action: 'CATEGORY_DELETED',
      entityType: 'category',
      entityId: req.params.id,
      summary: `Deleted category "${category?.name || req.params.id}"`,
      before: category || null
    });
    res.json({ msg: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};
