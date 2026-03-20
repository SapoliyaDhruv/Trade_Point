const User = require('../models/User');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const Rental = require('../models/Rental');
const Offer = require('../models/Offer');
const Notification = require('../models/Notification');
const Withdrawal = require('../models/Withdrawal');
const WalletLedger = require('../models/WalletLedger');
const { recordWithdrawalDebit } = require('../utils/wallet-ledger');

const getWalletSummary = async (userId) => {
  const ownerObjectId = new mongoose.Types.ObjectId(userId);

  const [earnedAgg, withdrawnAgg] = await Promise.all([
    Transaction.aggregate([
      {
        $match: {
          ownerId: ownerObjectId,
          paymentStatus: 'APPROVED'
        }
      },
      { $group: { _id: null, totalEarned: { $sum: '$ownerAmount' } } }
    ]),
    Withdrawal.aggregate([
      {
        $match: {
          userId: ownerObjectId,
          status: 'COMPLETED'
        }
      },
      { $group: { _id: null, totalWithdrawn: { $sum: '$amount' } } }
    ])
  ]);

  const totalEarned = Number(earnedAgg?.[0]?.totalEarned || 0);
  const totalWithdrawn = Number(withdrawnAgg?.[0]?.totalWithdrawn || 0);
  const availableBalance = Math.max(0, totalEarned - totalWithdrawn);

  return {
    totalEarned: Math.round(totalEarned),
    totalWithdrawn: Math.round(totalWithdrawn),
    availableBalance: Math.round(availableBalance)
  };
};

const sanitizeText = (value) => String(value || '').trim();

const maskAccountNumber = (value) => {
  const raw = String(value || '').replace(/\s+/g, '');
  if (raw.length <= 4) return raw || '';
  return `${'*'.repeat(raw.length - 4)}${raw.slice(-4)}`;
};

const validatePayoutDetails = (details) => {
  const payoutMethod = (details?.payoutMethod || 'none').toLowerCase();
  if (payoutMethod === 'none') {
    return { valid: true };
  }

  if (payoutMethod === 'bank') {
    const accountHolderName = sanitizeText(details.accountHolderName);
    const bankName = sanitizeText(details.bankName);
    const accountNumber = sanitizeText(details.accountNumber).replace(/\s+/g, '');
    const ifscCode = sanitizeText(details.ifscCode).toUpperCase();

    if (!accountHolderName || !bankName || !accountNumber || !ifscCode) {
      return { valid: false, msg: 'Bank payout requires account holder, bank name, account number, and IFSC code' };
    }
    if (!/^\d{6,20}$/.test(accountNumber)) {
      return { valid: false, msg: 'Account number must be 6 to 20 digits' };
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
      return { valid: false, msg: 'Enter a valid IFSC code (example: HDFC0001234)' };
    }
    return { valid: true };
  }

  if (payoutMethod === 'upi') {
    const upiId = sanitizeText(details.upiId).toLowerCase();
    if (!upiId || !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(upiId)) {
      return { valid: false, msg: 'Enter a valid UPI ID (example: yourname@upi)' };
    }
    return { valid: true };
  }

  return { valid: false, msg: 'Invalid payout method' };
};

const buildPayoutMeta = (payoutDetails) => {
  const details = payoutDetails || {};
  const payoutMethod = (details.payoutMethod || 'none').toLowerCase();
  const validation = validatePayoutDetails(details);

  return {
    payoutMethod,
    payoutReady: payoutMethod !== 'none' && validation.valid,
    maskedAccountNumber: payoutMethod === 'bank' ? maskAccountNumber(details.accountNumber) : '',
    bankName: payoutMethod === 'bank' ? sanitizeText(details.bankName) : '',
    upiId: payoutMethod === 'upi' ? sanitizeText(details.upiId).toLowerCase() : ''
  };
};

// 1. Update profile (name + optional photo)
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id; // from JWT
    const { firstName, lastName } = req.body;

    const updateData = {};

    if (firstName) updateData.firstName = firstName.trim();
    if (lastName) updateData.lastName = lastName.trim();

    const payoutFieldKeys = [
      'payoutMethod',
      'accountHolderName',
      'bankName',
      'accountNumber',
      'ifscCode',
      'upiId'
    ];
    const hasPayoutInput = payoutFieldKeys.some((key) => Object.prototype.hasOwnProperty.call(req.body, key));
    if (hasPayoutInput) {
      const payoutDetails = {
        payoutMethod: sanitizeText(req.body.payoutMethod || 'none').toLowerCase(),
        accountHolderName: sanitizeText(req.body.accountHolderName),
        bankName: sanitizeText(req.body.bankName),
        accountNumber: sanitizeText(req.body.accountNumber).replace(/\s+/g, ''),
        ifscCode: sanitizeText(req.body.ifscCode).toUpperCase(),
        upiId: sanitizeText(req.body.upiId).toLowerCase()
      };

      if (!['none', 'bank', 'upi'].includes(payoutDetails.payoutMethod)) {
        return res.status(400).json({ msg: 'Invalid payout method' });
      }

      if (payoutDetails.payoutMethod === 'none') {
        payoutDetails.accountHolderName = '';
        payoutDetails.bankName = '';
        payoutDetails.accountNumber = '';
        payoutDetails.ifscCode = '';
        payoutDetails.upiId = '';
      }
      if (payoutDetails.payoutMethod === 'bank') {
        payoutDetails.upiId = '';
      }
      if (payoutDetails.payoutMethod === 'upi') {
        payoutDetails.accountHolderName = '';
        payoutDetails.bankName = '';
        payoutDetails.accountNumber = '';
        payoutDetails.ifscCode = '';
      }

      const payoutValidation = validatePayoutDetails(payoutDetails);
      if (!payoutValidation.valid) {
        return res.status(400).json({ msg: payoutValidation.msg });
      }

      updateData.payoutDetails = payoutDetails;
    }

    // If new photo was uploaded
    if (req.file) {
      const pathValue = req.file.url || req.file.path;
      if (pathValue) {
        updateData.profilePhoto = String(pathValue).replace(/\\/g, '/');
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ msg: 'No changes provided' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password -otp -otpExpire -resetOtp -resetOtpExpire');

    if (!updatedUser) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Optional: update current user in auth service (frontend will refresh anyway)
    res.json({
      msg: 'Profile updated successfully',
      user: {
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        role: updatedUser.role,
        profilePhoto: updatedUser.profilePhoto,
        payoutDetails: updatedUser.payoutDetails
      }
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// 2. Change password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Current password is incorrect' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    await user.save();

    res.json({ msg: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// 3. User dashboard stats (seller-side metrics)
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const [products, approvedTransactions, activeRentals] = await Promise.all([
      Product.find({ seller: userId }).select('_id status').lean(),
      Transaction.find({ ownerId: userId, paymentStatus: 'APPROVED' })
        .select('buyerId ownerAmount offerId')
        .populate('offerId', 'offerType')
        .lean(),
      Rental.countDocuments({
        ownerId: userId,
        returnStatus: { $in: ['PENDING_RETURN', 'RETURN_REQUESTED'] }
      })
    ]);

    const totalListings = products.length;
    const approvedListings = products.filter(p => p.status === 'approved').length;

    const uniqueBuyers = new Set();
    let totalSales = 0;
    let totalRentDeals = 0;
    let totalRevenue = 0;

    for (const tx of approvedTransactions) {
      if (tx.buyerId) {
        uniqueBuyers.add(String(tx.buyerId));
      }

      totalRevenue += Number(tx.ownerAmount || 0);

      const offerType = tx.offerId?.offerType?.toUpperCase?.() || '';
      if (offerType === 'SELL') {
        totalSales += 1;
      } else if (offerType === 'RENT') {
        totalRentDeals += 1;
      }
    }

    const wallet = await getWalletSummary(userId);

    res.json({
      totalBuyers: uniqueBuyers.size,
      currentRentedItems: activeRentals,
      totalSales,
      totalRentDeals,
      totalRevenue: wallet.availableBalance, // net after withdrawals
      grossRevenue: wallet.totalEarned,
      totalWithdrawn: wallet.totalWithdrawn,
      availableBalance: wallet.availableBalance,
      totalListings,
      approvedListings
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// 4. Dashboard analytics (monthly trend + conversion + active listings)
exports.getDashboardAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const months = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('en-US', { month: 'short' }),
        start: new Date(d),
        end: new Date(d.getFullYear(), d.getMonth() + 1, 1)
      });
    }

    const [txns, offers, activeListings] = await Promise.all([
      Transaction.find({ ownerId: userId, paymentStatus: 'APPROVED' })
        .select('offerId ownerAmount approvedAt createdAt')
        .populate('offerId', 'offerType')
        .lean(),
      Offer.find({ ownerId: userId }).select('status').lean(),
      Product.countDocuments({ seller: userId, status: 'approved', isActive: true })
    ]);

    const monthly = months.map((m) => ({
      label: m.label,
      sales: 0,
      rentals: 0,
      revenue: 0
    }));

    for (const tx of txns) {
      const ts = tx.approvedAt || tx.createdAt;
      if (!ts) continue;
      const key = `${new Date(ts).getFullYear()}-${String(new Date(ts).getMonth() + 1).padStart(2, '0')}`;
      const idx = months.findIndex((m) => m.key === key);
      if (idx === -1) continue;

      const type = tx.offerId?.offerType?.toUpperCase?.() || '';
      if (type === 'SELL') monthly[idx].sales += 1;
      if (type === 'RENT') monthly[idx].rentals += 1;
      monthly[idx].revenue += Number(tx.ownerAmount || 0);
    }

    const processedOffers = offers.filter((o) => ['APPROVED', 'REJECTED', 'ACCEPTED', 'COUNTERED'].includes(o.status)).length;
    const successfulOffers = offers.filter((o) => ['APPROVED', 'ACCEPTED'].includes(o.status)).length;
    const conversionRate = processedOffers > 0
      ? Number(((successfulOffers / processedOffers) * 100).toFixed(1))
      : 0;

    res.json({
      monthly: monthly.map((m) => ({ ...m, revenue: Math.round(m.revenue) })),
      conversionRate,
      activeListings
    });
  } catch (err) {
    console.error('Dashboard analytics error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// 5. Wishlist APIs
exports.getWishlist = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate({
        path: 'wishlist',
        select: 'name photos type salePriceMin salePriceMax rentPricePerDay rentPricePerHour status isActive location',
      })
      .lean();

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    const items = (user.wishlist || []).filter((p) => p && p.status === 'approved' && p.isActive);
    res.json(items);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.addToWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId).select('_id status isActive').lean();
    if (!product || product.status !== 'approved' || !product.isActive) {
      return res.status(404).json({ msg: 'Product not available' });
    }

    await User.findByIdAndUpdate(req.user.id, { $addToSet: { wishlist: productId } });
    res.json({ msg: 'Added to wishlist' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    await User.findByIdAndUpdate(req.user.id, { $pull: { wishlist: productId } });
    res.json({ msg: 'Removed from wishlist' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

// 6. Recently viewed APIs
exports.getRecentlyViewed = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate({
        path: 'recentlyViewed',
        select: 'name photos type salePriceMin salePriceMax rentPricePerDay rentPricePerHour status isActive location',
      })
      .lean();

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    const items = (user.recentlyViewed || []).filter((p) => p && p.status === 'approved' && p.isActive);
    res.json(items);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.trackRecentlyViewed = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId).select('_id status isActive').lean();
    if (!product || product.status !== 'approved' || !product.isActive) {
      return res.status(404).json({ msg: 'Product not available' });
    }

    const user = await User.findById(req.user.id).select('recentlyViewed');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    const next = [String(productId), ...(user.recentlyViewed || []).map((id) => String(id)).filter((id) => id !== String(productId))]
      .slice(0, 20);

    user.recentlyViewed = next;
    await user.save();

    res.json({ msg: 'Tracked' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

// 7. Notification APIs
exports.getNotifications = async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    const unreadOnly = req.query.unreadOnly === 'true';

    const query = { userId: req.user.id };
    if (unreadOnly) query.isRead = false;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.getUnreadNotificationCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ userId: req.user.id, isRead: false });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Notification.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ msg: 'Notification not found' });
    }

    res.json({ msg: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user.id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ msg: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

// 8. Wallet and withdrawals
exports.getWalletSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const [summary, user] = await Promise.all([
      getWalletSummary(userId),
      User.findById(userId).select('payoutDetails').lean()
    ]);
    const withdrawals = await Withdrawal.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('amount status method reference createdAt note')
      .lean();

    const payout = buildPayoutMeta(user?.payoutDetails || {});

    res.json({
      ...summary,
      payout,
      withdrawals
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.getWalletLedger = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 15));
    const skip = (page - 1) * limit;

    const status = String(req.query.status || '').trim().toUpperCase();
    const direction = String(req.query.direction || '').trim().toUpperCase();
    const entryType = String(req.query.entryType || '').trim().toUpperCase();

    const query = { userId };
    if (['PENDING', 'POSTED', 'REVERSED'].includes(status)) {
      query.status = status;
    }
    if (['CREDIT', 'DEBIT'].includes(direction)) {
      query.direction = direction;
    }
    if (['ESCROW', 'PENALTY', 'WITHDRAWAL', 'ADJUSTMENT'].includes(entryType)) {
      query.entryType = entryType;
    }

    const [items, total] = await Promise.all([
      WalletLedger.find(query)
        .populate('counterpartyUserId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WalletLedger.countDocuments(query)
    ]);

    res.json({
      items: items.map((row) => {
        const signedAmount = row.direction === 'DEBIT' ? -Number(row.amount || 0) : Number(row.amount || 0);
        return {
          _id: row._id,
          direction: row.direction,
          entryType: row.entryType,
          status: row.status,
          amount: Number(row.amount || 0),
          effectiveAmount: row.status === 'POSTED' ? signedAmount : 0,
          signedAmount,
          reference: row.reference || '',
          description: row.description || '',
          transactionId: row.transactionId || null,
          rentalId: row.rentalId || null,
          withdrawalId: row.withdrawalId || null,
          counterparty: row.counterpartyUserId
            ? {
                _id: row.counterpartyUserId._id,
                name: `${row.counterpartyUserId.firstName || ''} ${row.counterpartyUserId.lastName || ''}`.trim(),
                email: row.counterpartyUserId.email || ''
              }
            : null,
          createdAt: row.createdAt,
          settledAt: row.settledAt || null
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.withdrawFromWallet = async (req, res) => {
  try {
    const userId = req.user.id;
    const amount = Number(req.body?.amount);
    const note = String(req.body?.note || '').trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ msg: 'Enter a valid withdrawal amount' });
    }

    const [summary, user] = await Promise.all([
      getWalletSummary(userId),
      User.findById(userId).select('payoutDetails').lean()
    ]);

    const payoutValidation = validatePayoutDetails(user?.payoutDetails || {});
    const payoutMeta = buildPayoutMeta(user?.payoutDetails || {});
    if (!payoutValidation.valid || !payoutMeta.payoutReady) {
      return res.status(400).json({
        msg: 'Set up payout account details in Profile before withdrawing.'
      });
    }

    if (amount > summary.availableBalance) {
      return res.status(400).json({
        msg: `Insufficient balance. Available: Rs. ${summary.availableBalance}`
      });
    }

    const withdrawal = await Withdrawal.create({
      userId,
      amount: Math.round(amount),
      method: payoutMeta.payoutMethod === 'upi' ? 'UPI_TRANSFER' : 'BANK_TRANSFER',
      status: 'COMPLETED',
      reference: `wd_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      note: note || `Withdrawn to ${payoutMeta.payoutMethod === 'upi' ? payoutMeta.upiId : payoutMeta.bankName} ${payoutMeta.maskedAccountNumber}`
    });
    await recordWithdrawalDebit(withdrawal);

    const updated = await getWalletSummary(userId);

    res.json({
      msg: 'Withdrawal completed successfully',
      withdrawal,
      wallet: {
        ...updated,
        payout: payoutMeta
      }
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};
