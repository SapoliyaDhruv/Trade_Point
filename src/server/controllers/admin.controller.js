const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Offer = require('../models/Offer');
const Notification = require('../models/Notification');
const AdminChatMessage = require('../models/AdminChatMessage');
const AdminAuditLog = require('../models/AdminAuditLog');
const mongoose = require('mongoose');
const {
  getPlatformSettings,
  normalizeKeywords,
  extractModerationFlags
} = require('../utils/platform-settings');
const { resolveEscrowEntry } = require('../utils/wallet-ledger');
const { logAdminAudit } = require('../utils/admin-audit');

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const isoDate = (date) => new Date(date).toISOString().slice(0, 10);

const buildReportRange = (query = {}) => {
  const now = new Date();
  const range = String(query.range || 'month').toLowerCase();

  if (!['week', 'month', 'year', 'custom'].includes(range)) {
    return { error: 'Invalid range. Use week, month, year, or custom.' };
  }

  if (range === 'week') {
    const base = query.weekStart ? new Date(query.weekStart) : now;
    if (Number.isNaN(base.getTime())) {
      return { error: 'Invalid weekStart date.' };
    }

    const start = startOfDay(base);
    const weekday = (start.getDay() + 6) % 7; // Monday-based week
    start.setDate(start.getDate() - weekday);

    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    return {
      range,
      start,
      end,
      label: `Week of ${isoDate(start)}`
    };
  }

  if (range === 'month') {
    const year = Math.max(2000, Math.min(2100, toNumber(query.year, now.getFullYear())));
    const month = Math.max(1, Math.min(12, toNumber(query.month, now.getMonth() + 1)));
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    return {
      range,
      start,
      end,
      label: `${start.toLocaleString('default', { month: 'long' })} ${year}`
    };
  }

  if (range === 'year') {
    const year = Math.max(2000, Math.min(2100, toNumber(query.year, now.getFullYear())));
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);

    return {
      range,
      start,
      end,
      label: `${year}`
    };
  }

  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;

  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { error: 'For custom range, valid from and to dates are required.' };
  }

  const start = startOfDay(from);
  const end = startOfDay(to);
  end.setDate(end.getDate() + 1); // include full "to" day

  if (start >= end) {
    return { error: 'Custom range is invalid. "from" must be before "to".' };
  }

  return {
    range,
    start,
    end,
    label: `${isoDate(start)} to ${isoDate(new Date(end.getTime() - 1))}`
  };
};

const sanitizeCsv = (value) => {
  if (value === null || value === undefined) {
    return '""';
  }
  return `"${String(value).replace(/"/g, '""')}"`;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password -otp -otpExpire -resetOtp -resetOtpExpire');
    res.json(users);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const userId = req.params.id;

    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ msg: 'Invalid role' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true }
    );

    await logAdminAudit(req, {
      action: 'USER_ROLE_UPDATED',
      entityType: 'user',
      entityId: userId,
      summary: `Updated user role to ${role}`,
      after: { role: user?.role }
    });

    res.json({ msg: 'Role updated', user });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

// Get Pending Transactions – only after buyer paid
exports.getPendingTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({
      paymentStatus: 'PAID_AWAITING_ADMIN'  // Only show after payment
    })
      .populate('productId', 'name type photos')
      .populate('buyerId', 'firstName lastName email')
      .populate('ownerId', 'firstName lastName email')
      .populate('offerId', 'offerAmount offerType counterAmount')
      .sort({ createdAt: -1 })
      .lean();

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

// Approve Transaction (Admin)
exports.approveTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { note } = req.body || {};

    const transaction = await Transaction.findById(transactionId)
      .populate('offerId')
      .populate('productId');

    if (!transaction) {
      return res.status(404).json({ msg: 'Transaction not found' });
    }

    if (transaction.paymentStatus !== 'PAID_AWAITING_ADMIN') {
      return res.status(400).json({ msg: 'Transaction not ready for approval' });
    }

    transaction.paymentStatus = 'APPROVED';
    transaction.approvedAt = new Date();
    if (note) transaction.adminNote = note;

    // Final step: mark product as sold/rented
    const product = transaction.productId;
    if (product) {
      product.status = transaction.offerId.offerType === 'RENT' ? 'rented_out' : 'sold';
      await product.save();
    }

    await transaction.save();
    await resolveEscrowEntry(transaction, { approved: true });
    await logAdminAudit(req, {
      action: 'TRANSACTION_APPROVED',
      entityType: 'transaction',
      entityId: transaction._id,
      summary: `Approved transaction for Rs. ${Number(transaction.totalAmount || 0)}`,
      metadata: {
        note: note || '',
        buyerId: transaction.buyerId,
        ownerId: transaction.ownerId,
        productId: transaction.productId?._id || transaction.productId
      },
      after: {
        paymentStatus: transaction.paymentStatus
      }
    });

    res.json({
      msg: 'Transaction approved. Deal complete.',
      transaction
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

// Reject Transaction (Admin)
exports.rejectTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { note } = req.body || {};

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ msg: 'Transaction not found' });
    }

    if (transaction.paymentStatus !== 'PAID_AWAITING_ADMIN') {
      return res.status(400).json({ msg: 'Transaction not ready for rejection' });
    }

    transaction.paymentStatus = 'REJECTED_BY_ADMIN';
    transaction.rejectedAt = new Date();
    if (note) transaction.adminNote = note;

    await transaction.save();
    await resolveEscrowEntry(transaction, { approved: false });
    await logAdminAudit(req, {
      action: 'TRANSACTION_REJECTED',
      entityType: 'transaction',
      entityId: transaction._id,
      summary: `Rejected transaction for Rs. ${Number(transaction.totalAmount || 0)}`,
      metadata: {
        note: note || '',
        buyerId: transaction.buyerId,
        ownerId: transaction.ownerId
      },
      after: {
        paymentStatus: transaction.paymentStatus
      }
    });

    res.json({
      msg: 'Transaction rejected by admin',
      transaction
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.getDashboardOverview = async (req, res) => {
  try {
    const [
      totalUsers,
      verifiedUsers,
      totalProducts,
      pendingProducts,
      approvedProducts,
      soldProducts,
      rentedProducts,
      activeProducts,
      totalTransactions,
      pendingTransactions,
      approvedTransactions,
      rejectedTransactions,
      financeAgg,
      recentPendingTransactions
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isVerified: true }),
      Product.countDocuments(),
      Product.countDocuments({ status: 'pending' }),
      Product.countDocuments({ status: 'approved' }),
      Product.countDocuments({ status: 'sold' }),
      Product.countDocuments({ status: 'rented_out' }),
      Product.countDocuments({ status: 'approved', isActive: true }),
      Transaction.countDocuments(),
      Transaction.countDocuments({ paymentStatus: 'PAID_AWAITING_ADMIN' }),
      Transaction.countDocuments({ paymentStatus: 'APPROVED' }),
      Transaction.countDocuments({ paymentStatus: 'REJECTED_BY_ADMIN' }),
      Transaction.aggregate([
        { $match: { paymentStatus: 'APPROVED' } },
        {
          $group: {
            _id: null,
            grossVolume: { $sum: '$totalAmount' },
            platformRevenue: { $sum: '$platformFee' },
            sellerPayouts: { $sum: '$ownerAmount' }
          }
        }
      ]),
      Transaction.find({ paymentStatus: 'PAID_AWAITING_ADMIN' })
        .populate('productId', 'name type')
        .populate('buyerId', 'firstName lastName')
        .populate('ownerId', 'firstName lastName')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
    ]);

    const finance = financeAgg?.[0] || {
      grossVolume: 0,
      platformRevenue: 0,
      sellerPayouts: 0
    };

    const pendingTx = recentPendingTransactions.map((tx) => ({
      _id: tx._id,
      productName: tx.productId?.name || 'Unknown Product',
      productType: tx.productId?.type || '-',
      buyerName: `${tx.buyerId?.firstName || ''} ${tx.buyerId?.lastName || ''}`.trim() || 'Unknown Buyer',
      sellerName: `${tx.ownerId?.firstName || ''} ${tx.ownerId?.lastName || ''}`.trim() || 'Unknown Seller',
      totalAmount: Number(tx.totalAmount || 0),
      createdAt: tx.createdAt
    }));

    res.json({
      users: {
        totalUsers,
        verifiedUsers,
        unverifiedUsers: Math.max(0, totalUsers - verifiedUsers)
      },
      products: {
        totalProducts,
        pendingProducts,
        approvedProducts,
        soldProducts,
        rentedProducts,
        activeProducts
      },
      transactions: {
        totalTransactions,
        pendingTransactions,
        approvedTransactions,
        rejectedTransactions
      },
      finance: {
        grossVolume: Number(finance.grossVolume || 0),
        platformRevenue: Number(finance.platformRevenue || 0),
        sellerPayouts: Number(finance.sellerPayouts || 0)
      },
      recentPendingTransactions: pendingTx
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.getRiskFlags = async (req, res) => {
  try {
    const settings = await getPlatformSettings();
    const highValueThreshold = Number(settings.highValueThreshold || 50000);
    const staleCutoff = new Date(Date.now() - 36 * 60 * 60 * 1000);
    const recentWindow = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [highValuePending, stalePending, repeatedRejectedBuyers, flaggedProducts] = await Promise.all([
      Transaction.find({
        paymentStatus: 'PAID_AWAITING_ADMIN',
        totalAmount: { $gte: highValueThreshold }
      })
        .populate('productId', 'name')
        .populate('buyerId', 'firstName lastName email')
        .sort({ totalAmount: -1, createdAt: -1 })
        .limit(10)
        .lean(),
      Transaction.find({
        paymentStatus: 'PAID_AWAITING_ADMIN',
        createdAt: { $lte: staleCutoff }
      })
        .populate('productId', 'name')
        .populate('buyerId', 'firstName lastName email')
        .sort({ createdAt: 1 })
        .limit(10)
        .lean(),
      Transaction.aggregate([
        {
          $match: {
            paymentStatus: 'REJECTED_BY_ADMIN',
            createdAt: { $gte: recentWindow }
          }
        },
        { $group: { _id: '$buyerId', rejectedCount: { $sum: 1 } } },
        { $match: { rejectedCount: { $gte: 3 } } },
        { $sort: { rejectedCount: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'buyer'
          }
        },
        { $unwind: '$buyer' },
        {
          $project: {
            _id: 0,
            buyerId: '$buyer._id',
            name: { $trim: { input: { $concat: ['$buyer.firstName', ' ', '$buyer.lastName'] } } },
            email: '$buyer.email',
            rejectedCount: 1
          }
        }
      ]),
      Product.find({ status: 'pending', moderationStatus: 'flagged' })
        .populate('seller', 'firstName lastName email')
        .populate('category', 'name')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
    ]);

    res.json({
      highValueThreshold,
      highValuePending: highValuePending.map((tx) => ({
        _id: tx._id,
        amount: Number(tx.totalAmount || 0),
        createdAt: tx.createdAt,
        productName: tx.productId?.name || 'Unknown Product',
        buyerName: `${tx.buyerId?.firstName || ''} ${tx.buyerId?.lastName || ''}`.trim() || 'Unknown Buyer',
        buyerEmail: tx.buyerId?.email || ''
      })),
      stalePending: stalePending.map((tx) => ({
        _id: tx._id,
        amount: Number(tx.totalAmount || 0),
        createdAt: tx.createdAt,
        productName: tx.productId?.name || 'Unknown Product',
        buyerName: `${tx.buyerId?.firstName || ''} ${tx.buyerId?.lastName || ''}`.trim() || 'Unknown Buyer',
        buyerEmail: tx.buyerId?.email || ''
      })),
      repeatedRejectedBuyers,
      flaggedProducts: flaggedProducts.map((p) => ({
        _id: p._id,
        name: p.name,
        type: p.type,
        flags: p.moderationFlags || [],
        createdAt: p.createdAt,
        category: p.category?.name || 'Unknown',
        sellerName: `${p.seller?.firstName || ''} ${p.seller?.lastName || ''}`.trim() || 'Unknown Seller'
      }))
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.getCommissionSettings = async (req, res) => {
  try {
    const [settings, categories] = await Promise.all([
      getPlatformSettings(),
      Category.find()
        .select('name status feePercentage')
        .sort({ name: 1 })
        .lean()
    ]);

    res.json({
      defaultCommissionPercent: Number(settings.defaultCommissionPercent || 10),
      categories: categories.map((c) => ({
        _id: c._id,
        name: c.name,
        status: c.status,
        feePercentage: Number(c.feePercentage ?? settings.defaultCommissionPercent ?? 10)
      }))
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.updateDefaultCommission = async (req, res) => {
  try {
    const percent = Number(req.body?.defaultCommissionPercent);
    const applyToAllCategories = Boolean(req.body?.applyToAllCategories);

    if (Number.isNaN(percent) || percent < 0 || percent > 100) {
      return res.status(400).json({ msg: 'Default commission must be between 0 and 100' });
    }

    const settings = await getPlatformSettings();
    settings.defaultCommissionPercent = percent;
    settings.updatedBy = req.user.id;
    await settings.save();

    if (applyToAllCategories) {
      await Category.updateMany({}, { $set: { feePercentage: percent } });
    }

    await logAdminAudit(req, {
      action: 'DEFAULT_COMMISSION_UPDATED',
      entityType: 'platform',
      entityId: 'commission',
      summary: `Default commission set to ${percent}%`,
      metadata: { applyToAllCategories }
    });

    res.json({
      msg: 'Default commission updated',
      defaultCommissionPercent: percent,
      applyToAllCategories
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.updateCategoryCommission = async (req, res) => {
  try {
    const percent = Number(req.body?.feePercentage);
    if (Number.isNaN(percent) || percent < 0 || percent > 100) {
      return res.status(400).json({ msg: 'Category commission must be between 0 and 100' });
    }

    const category = await Category.findByIdAndUpdate(
      req.params.categoryId,
      { feePercentage: percent },
      { new: true }
    );

    if (!category) {
      return res.status(404).json({ msg: 'Category not found' });
    }

    await logAdminAudit(req, {
      action: 'CATEGORY_COMMISSION_UPDATED',
      entityType: 'category',
      entityId: category._id,
      summary: `Category commission set to ${percent}%`,
      metadata: { categoryName: category.name }
    });

    res.json({
      msg: 'Category commission updated',
      category: {
        _id: category._id,
        name: category.name,
        status: category.status,
        feePercentage: Number(category.feePercentage || percent)
      }
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.broadcastNotification = async (req, res) => {
  try {
    const {
      title,
      message,
      target = 'all',
      link = '',
      type = 'ADMIN_BROADCAST'
    } = req.body || {};

    if (!title || !message) {
      return res.status(400).json({ msg: 'Title and message are required' });
    }

    let userIds = [];

    if (target === 'all') {
      const users = await User.find({ role: 'user' }).select('_id').lean();
      userIds = users.map((u) => u._id);
    } else if (target === 'verified') {
      const users = await User.find({ role: 'user', isVerified: true }).select('_id').lean();
      userIds = users.map((u) => u._id);
    } else if (target === 'unverified') {
      const users = await User.find({ role: 'user', isVerified: false }).select('_id').lean();
      userIds = users.map((u) => u._id);
    } else if (target === 'sellers') {
      userIds = await Product.distinct('seller', {});
    } else if (target === 'buyers') {
      userIds = await Offer.distinct('buyerId', {});
    } else {
      return res.status(400).json({ msg: 'Invalid broadcast target' });
    }

    const uniqueIds = [...new Set(userIds.map((id) => String(id)))];
    if (!uniqueIds.length) {
      return res.status(400).json({ msg: 'No users found for selected target' });
    }

    const docs = uniqueIds.map((id) => ({
      userId: id,
      type,
      title: String(title).trim(),
      message: String(message).trim(),
      link: String(link || '').trim(),
      meta: {
        target,
        sentByAdminId: req.user.id
      }
    }));

    await Notification.insertMany(docs, { ordered: false });
    await logAdminAudit(req, {
      action: 'BROADCAST_SENT',
      entityType: 'notification',
      entityId: target,
      summary: `Broadcast sent to ${uniqueIds.length} users`,
      metadata: {
        target,
        sentCount: uniqueIds.length,
        title: String(title).trim()
      }
    });

    res.json({
      msg: 'Notification broadcast sent',
      target,
      sentCount: uniqueIds.length
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const days = Math.max(7, Math.min(90, Number(req.query?.days) || 14));
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const [usersAgg, productsAgg, txAgg] = await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $gte: start } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        }
      ]),
      Product.aggregate([
        { $match: { createdAt: { $gte: start } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        }
      ]),
      Transaction.aggregate([
        {
          $match: {
            paymentStatus: 'APPROVED',
            approvedAt: { $gte: start }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$approvedAt' } },
            count: { $sum: 1 },
            grossVolume: { $sum: '$totalAmount' }
          }
        }
      ])
    ]);

    const usersMap = Object.fromEntries(usersAgg.map((x) => [x._id, Number(x.count || 0)]));
    const productsMap = Object.fromEntries(productsAgg.map((x) => [x._id, Number(x.count || 0)]));
    const txCountMap = Object.fromEntries(txAgg.map((x) => [x._id, Number(x.count || 0)]));
    const txVolumeMap = Object.fromEntries(txAgg.map((x) => [x._id, Number(x.grossVolume || 0)]));

    const labels = [];
    const newUsers = [];
    const newProducts = [];
    const approvedTransactions = [];
    const grossVolume = [];

    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);

      labels.push(key);
      newUsers.push(usersMap[key] || 0);
      newProducts.push(productsMap[key] || 0);
      approvedTransactions.push(txCountMap[key] || 0);
      grossVolume.push(txVolumeMap[key] || 0);
    }

    res.json({
      days,
      labels,
      series: {
        newUsers,
        newProducts,
        approvedTransactions,
        grossVolume
      },
      totals: {
        newUsers: newUsers.reduce((a, b) => a + b, 0),
        newProducts: newProducts.reduce((a, b) => a + b, 0),
        approvedTransactions: approvedTransactions.reduce((a, b) => a + b, 0),
        grossVolume: grossVolume.reduce((a, b) => a + b, 0)
      }
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.getAuditLogAdmins = async (_req, res) => {
  try {
    const admins = await User.find({ role: 'admin' })
      .select('_id firstName lastName email')
      .sort({ firstName: 1, lastName: 1 })
      .lean();

    res.json(
      admins.map((u) => ({
        _id: u._id,
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Admin',
        email: u.email || ''
      }))
    );
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const action = String(req.query.action || '').trim();
    const entityType = String(req.query.entityType || '').trim();
    const adminId = String(req.query.adminId || '').trim();
    const q = String(req.query.q || '').trim();
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;

    const match = {};

    if (action) {
      match.action = action;
    }
    if (entityType) {
      match.entityType = entityType;
    }
    if (adminId) {
      if (!mongoose.Types.ObjectId.isValid(adminId)) {
        return res.status(400).json({ msg: 'Invalid adminId filter' });
      }
      match.adminId = new mongoose.Types.ObjectId(adminId);
    }
    if (from || to) {
      match.createdAt = {};
      if (from && !Number.isNaN(from.getTime())) {
        from.setHours(0, 0, 0, 0);
        match.createdAt.$gte = from;
      }
      if (to && !Number.isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        match.createdAt.$lte = to;
      }
    }
    if (q) {
      const regex = new RegExp(escapeRegex(q), 'i');
      match.$or = [
        { action: regex },
        { entityType: regex },
        { entityId: regex },
        { summary: regex }
      ];
    }

    const [items, total] = await Promise.all([
      AdminAuditLog.find(match)
        .populate('adminId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AdminAuditLog.countDocuments(match)
    ]);

    res.json({
      items: items.map((log) => ({
        _id: log._id,
        action: log.action,
        entityType: log.entityType || '',
        entityId: log.entityId || '',
        summary: log.summary || '',
        metadata: log.metadata || {},
        before: log.before,
        after: log.after,
        ipAddress: log.ipAddress || '',
        userAgent: log.userAgent || '',
        createdAt: log.createdAt,
        admin: log.adminId
          ? {
              _id: log.adminId._id,
              name: `${log.adminId.firstName || ''} ${log.adminId.lastName || ''}`.trim() || 'Admin',
              email: log.adminId.email || ''
            }
          : null
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.getModerationOverview = async (req, res) => {
  try {
    const settings = await getPlatformSettings();
    const flaggedPending = await Product.find({ status: 'pending', moderationStatus: 'flagged' })
      .populate('seller', 'firstName lastName email')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    res.json({
      keywords: settings.moderationKeywords || [],
      flaggedPendingProducts: flaggedPending.map((p) => ({
        _id: p._id,
        name: p.name,
        type: p.type,
        category: p.category?.name || 'Unknown',
        sellerName: `${p.seller?.firstName || ''} ${p.seller?.lastName || ''}`.trim() || 'Unknown Seller',
        sellerEmail: p.seller?.email || '',
        flags: p.moderationFlags || [],
        createdAt: p.createdAt
      }))
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.updateModerationKeywords = async (req, res) => {
  try {
    const rawKeywords = req.body?.keywords;
    const rescanPending = Boolean(req.body?.rescanPending);

    if (!Array.isArray(rawKeywords)) {
      return res.status(400).json({ msg: 'keywords must be an array of strings' });
    }

    const keywords = normalizeKeywords(rawKeywords);
    if (!keywords.length) {
      return res.status(400).json({ msg: 'At least one valid moderation keyword is required' });
    }

    const settings = await getPlatformSettings();
    settings.moderationKeywords = keywords;
    settings.updatedBy = req.user.id;
    await settings.save();

    let rescannedCount = 0;

    if (rescanPending) {
      const pendingProducts = await Product.find({ status: 'pending' })
        .select('_id name description location')
        .lean();

      const updates = pendingProducts.map((p) => {
        const flags = extractModerationFlags(
          { name: p.name, description: p.description, location: p.location },
          keywords
        );

        return {
          updateOne: {
            filter: { _id: p._id },
            update: {
              $set: {
                moderationFlags: flags,
                moderationStatus: flags.length ? 'flagged' : 'clean'
              }
            }
          }
        };
      });

      if (updates.length) {
        const writeResult = await Product.bulkWrite(updates, { ordered: false });
        rescannedCount = Number(writeResult?.modifiedCount || 0);
      }
    }

    await logAdminAudit(req, {
      action: 'MODERATION_KEYWORDS_UPDATED',
      entityType: 'moderation',
      entityId: 'keywords',
      summary: `Updated moderation keywords (${keywords.length})`,
      metadata: {
        rescannedCount,
        keywordCount: keywords.length
      }
    });
    res.json({
      msg: 'Moderation keywords updated',
      keywords,
      rescannedCount
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.getEarningsReportUsers = async (req, res) => {
  try {
    const rows = await Transaction.aggregate([
      { $match: { paymentStatus: 'APPROVED' } },
      {
        $group: {
          _id: '$ownerId',
          totalDeals: { $sum: 1 },
          totalEarning: { $sum: '$ownerAmount' }
        }
      },
      { $sort: { totalEarning: -1 } },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 1,
          name: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ['$user.firstName', ''] },
                  ' ',
                  { $ifNull: ['$user.lastName', ''] }
                ]
              }
            }
          },
          email: { $ifNull: ['$user.email', ''] },
          totalDeals: 1,
          totalEarning: 1
        }
      },
      { $limit: 200 }
    ]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.getEarningsReport = async (req, res) => {
  try {
    const rangeData = buildReportRange(req.query);
    if (rangeData.error) {
      return res.status(400).json({ msg: rangeData.error });
    }

    const groupBy = String(req.query.groupBy || (rangeData.range === 'year' ? 'month' : 'day')).toLowerCase();
    if (!['day', 'week', 'month', 'user'].includes(groupBy)) {
      return res.status(400).json({ msg: 'Invalid groupBy. Use day, week, month, or user.' });
    }

    const match = {
      paymentStatus: 'APPROVED',
      approvedAt: { $gte: rangeData.start, $lt: rangeData.end }
    };

    const userId = req.query.userId ? String(req.query.userId) : '';
    let selectedUser = null;

    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ msg: 'Invalid userId filter.' });
      }
      match.ownerId = new mongoose.Types.ObjectId(userId);
      selectedUser = await User.findById(userId).select('firstName lastName email').lean();
    }

    const [totalsAgg, perUserAgg, trendAgg, recentTx] = await Promise.all([
      Transaction.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            platformEarnings: { $sum: '$platformFee' },
            sellerEarnings: { $sum: '$ownerAmount' },
            grossVolume: { $sum: '$totalAmount' },
            dealCount: { $sum: 1 }
          }
        }
      ]),
      Transaction.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$ownerId',
            sellerEarnings: { $sum: '$ownerAmount' },
            platformContribution: { $sum: '$platformFee' },
            grossVolume: { $sum: '$totalAmount' },
            dealCount: { $sum: 1 }
          }
        },
        { $sort: { sellerEarnings: -1 } },
        { $limit: 100 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $unwind: {
            path: '$user',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $project: {
            _id: 1,
            name: {
              $trim: {
                input: {
                  $concat: [
                    { $ifNull: ['$user.firstName', ''] },
                    ' ',
                    { $ifNull: ['$user.lastName', ''] }
                  ]
                }
              }
            },
            email: { $ifNull: ['$user.email', ''] },
            sellerEarnings: 1,
            platformContribution: 1,
            grossVolume: 1,
            dealCount: 1
          }
        }
      ]),
      (async () => {
        if (groupBy === 'user') {
          return Transaction.aggregate([
            { $match: match },
            {
              $group: {
                _id: '$ownerId',
                platformEarnings: { $sum: '$platformFee' },
                sellerEarnings: { $sum: '$ownerAmount' },
                grossVolume: { $sum: '$totalAmount' },
                dealCount: { $sum: 1 }
              }
            },
            { $sort: { grossVolume: -1 } },
            { $limit: 30 },
            {
              $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'user'
              }
            },
            {
              $unwind: {
                path: '$user',
                preserveNullAndEmptyArrays: true
              }
            },
            {
              $project: {
                label: {
                  $trim: {
                    input: {
                      $concat: [
                        { $ifNull: ['$user.firstName', ''] },
                        ' ',
                        { $ifNull: ['$user.lastName', ''] }
                      ]
                    }
                  }
                },
                platformEarnings: 1,
                sellerEarnings: 1,
                grossVolume: 1,
                dealCount: 1
              }
            }
          ]);
        }

        if (groupBy === 'week') {
          return Transaction.aggregate([
            { $match: match },
            {
              $group: {
                _id: {
                  year: { $isoWeekYear: '$approvedAt' },
                  week: { $isoWeek: '$approvedAt' }
                },
                platformEarnings: { $sum: '$platformFee' },
                sellerEarnings: { $sum: '$ownerAmount' },
                grossVolume: { $sum: '$totalAmount' },
                dealCount: { $sum: 1 }
              }
            },
            { $sort: { '_id.year': 1, '_id.week': 1 } },
            {
              $project: {
                _id: 0,
                label: { $concat: [{ $toString: '$_id.year' }, '-W', { $toString: '$_id.week' }] },
                platformEarnings: 1,
                sellerEarnings: 1,
                grossVolume: 1,
                dealCount: 1
              }
            }
          ]);
        }

        return Transaction.aggregate([
          { $match: match },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d',
                  date: '$approvedAt'
                }
              },
              platformEarnings: { $sum: '$platformFee' },
              sellerEarnings: { $sum: '$ownerAmount' },
              grossVolume: { $sum: '$totalAmount' },
              dealCount: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } },
          {
            $project: {
              _id: 0,
              label: '$_id',
              platformEarnings: 1,
              sellerEarnings: 1,
              grossVolume: 1,
              dealCount: 1
            }
          }
        ]);
      })(),
      Transaction.find(match)
        .populate('ownerId', 'firstName lastName email')
        .populate('buyerId', 'firstName lastName email')
        .populate('productId', 'name type')
        .sort({ approvedAt: -1 })
        .limit(25)
        .lean()
    ]);

    const totals = totalsAgg?.[0] || {
      platformEarnings: 0,
      sellerEarnings: 0,
      grossVolume: 0,
      dealCount: 0
    };

    res.json({
      filterSummary: {
        range: rangeData.range,
        label: rangeData.label,
        start: rangeData.start,
        end: rangeData.end,
        groupBy,
        userId: userId || null,
        selectedUser: selectedUser
          ? {
              _id: selectedUser._id,
              name: `${selectedUser.firstName || ''} ${selectedUser.lastName || ''}`.trim() || 'Unknown User',
              email: selectedUser.email || ''
            }
          : null
      },
      totals: {
        platformEarnings: Number(totals.platformEarnings || 0),
        sellerEarnings: Number(totals.sellerEarnings || 0),
        grossVolume: Number(totals.grossVolume || 0),
        dealCount: Number(totals.dealCount || 0)
      },
      userBreakdown: perUserAgg.map((x) => ({
        _id: x._id,
        name: x.name || 'Unknown User',
        email: x.email || '',
        sellerEarnings: Number(x.sellerEarnings || 0),
        platformContribution: Number(x.platformContribution || 0),
        grossVolume: Number(x.grossVolume || 0),
        dealCount: Number(x.dealCount || 0)
      })),
      trend: trendAgg.map((x) => ({
        label: x.label,
        platformEarnings: Number(x.platformEarnings || 0),
        sellerEarnings: Number(x.sellerEarnings || 0),
        grossVolume: Number(x.grossVolume || 0),
        dealCount: Number(x.dealCount || 0)
      })),
      recentApprovedTransactions: recentTx.map((tx) => ({
        _id: tx._id,
        approvedAt: tx.approvedAt,
        totalAmount: Number(tx.totalAmount || 0),
        platformFee: Number(tx.platformFee || 0),
        ownerAmount: Number(tx.ownerAmount || 0),
        productName: tx.productId?.name || 'Unknown Product',
        productType: tx.productId?.type || '-',
        sellerName: `${tx.ownerId?.firstName || ''} ${tx.ownerId?.lastName || ''}`.trim() || 'Unknown Seller',
        sellerEmail: tx.ownerId?.email || '',
        buyerName: `${tx.buyerId?.firstName || ''} ${tx.buyerId?.lastName || ''}`.trim() || 'Unknown Buyer',
        buyerEmail: tx.buyerId?.email || ''
      }))
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.exportEarningsReportCsv = async (req, res) => {
  try {
    const rangeData = buildReportRange(req.query);
    if (rangeData.error) {
      return res.status(400).json({ msg: rangeData.error });
    }

    const match = {
      paymentStatus: 'APPROVED',
      approvedAt: { $gte: rangeData.start, $lt: rangeData.end }
    };

    const userId = req.query.userId ? String(req.query.userId) : '';
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ msg: 'Invalid userId filter.' });
      }
      match.ownerId = new mongoose.Types.ObjectId(userId);
    }

    const transactions = await Transaction.find(match)
      .populate('ownerId', 'firstName lastName email')
      .populate('buyerId', 'firstName lastName email')
      .populate('productId', 'name type')
      .sort({ approvedAt: -1 })
      .limit(5000)
      .lean();

    const summary = transactions.reduce(
      (acc, tx) => {
        acc.grossVolume += Number(tx.totalAmount || 0);
        acc.platformEarnings += Number(tx.platformFee || 0);
        acc.sellerEarnings += Number(tx.ownerAmount || 0);
        return acc;
      },
      { grossVolume: 0, platformEarnings: 0, sellerEarnings: 0 }
    );

    const csvRows = [];
    csvRows.push('TradePoint Earnings Report');
    csvRows.push(`Range,${sanitizeCsv(rangeData.label)}`);
    csvRows.push(`From,${sanitizeCsv(rangeData.start.toISOString())}`);
    csvRows.push(`To,${sanitizeCsv(rangeData.end.toISOString())}`);
    csvRows.push(`Total Gross Volume,${summary.grossVolume}`);
    csvRows.push(`Total Platform Earnings,${summary.platformEarnings}`);
    csvRows.push(`Total Seller Earnings,${summary.sellerEarnings}`);
    csvRows.push(`Total Transactions,${transactions.length}`);
    csvRows.push('');
    csvRows.push([
      'Approved At',
      'Transaction ID',
      'Product',
      'Product Type',
      'Seller Name',
      'Seller Email',
      'Buyer Name',
      'Buyer Email',
      'Gross Amount',
      'Platform Fee',
      'Seller Earning'
    ].join(','));

    for (const tx of transactions) {
      const sellerName = `${tx.ownerId?.firstName || ''} ${tx.ownerId?.lastName || ''}`.trim() || 'Unknown Seller';
      const buyerName = `${tx.buyerId?.firstName || ''} ${tx.buyerId?.lastName || ''}`.trim() || 'Unknown Buyer';
      const row = [
        sanitizeCsv(tx.approvedAt ? new Date(tx.approvedAt).toISOString() : ''),
        sanitizeCsv(tx._id),
        sanitizeCsv(tx.productId?.name || 'Unknown Product'),
        sanitizeCsv(tx.productId?.type || '-'),
        sanitizeCsv(sellerName),
        sanitizeCsv(tx.ownerId?.email || ''),
        sanitizeCsv(buyerName),
        sanitizeCsv(tx.buyerId?.email || ''),
        Number(tx.totalAmount || 0),
        Number(tx.platformFee || 0),
        Number(tx.ownerAmount || 0)
      ];
      csvRows.push(row.join(','));
    }

    const csv = csvRows.join('\n');
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="earnings-report-${stamp}.csv"`);
    return res.status(200).send(csv);
  } catch (err) {
    return res.status(500).json({ msg: 'Server error' });
  }
};

exports.getAdminChatMessages = async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 60));
    const messages = await AdminChatMessage.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('adminId', 'firstName lastName email')
      .lean();

    const ordered = messages.reverse().map((msg) => ({
      _id: msg._id,
      message: msg.message,
      createdAt: msg.createdAt,
      admin: msg.adminId
        ? {
            _id: msg.adminId._id,
            name: `${msg.adminId.firstName || ''} ${msg.adminId.lastName || ''}`.trim() || 'Admin',
            email: msg.adminId.email || ''
          }
        : null
    }));

    res.json({
      currentAdminId: req.user.id,
      messages: ordered
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.sendAdminChatMessage = async (req, res) => {
  try {
    const text = String(req.body?.message || '').trim();
    if (!text) {
      return res.status(400).json({ msg: 'Message is required' });
    }
    if (text.length > 1000) {
      return res.status(400).json({ msg: 'Message too long (max 1000 characters)' });
    }

    const doc = await AdminChatMessage.create({
      adminId: req.user.id,
      message: text
    });

    await doc.populate('adminId', 'firstName lastName email');

    res.json({
      message: {
        _id: doc._id,
        message: doc.message,
        createdAt: doc.createdAt,
        admin: doc.adminId
          ? {
              _id: doc.adminId._id,
              name: `${doc.adminId.firstName || ''} ${doc.adminId.lastName || ''}`.trim() || 'Admin',
              email: doc.adminId.email || ''
            }
          : null
      }
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};
