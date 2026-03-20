const Rental = require('../models/Rental');
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const { createNotification } = require('../utils/notify');
const { recordPenaltyCredit } = require('../utils/wallet-ledger');

const generatePenaltyRef = () => `pen_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

// Buyer requests return
exports.requestReturn = async (req, res) => {
  try {
    const { transactionId, note } = req.body;
    if (!transactionId) {
      return res.status(400).json({ msg: 'transactionId is required' });
    }

    const transaction = await Transaction.findById(transactionId).populate('rentalId');
    if (!transaction || transaction.buyerId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized or transaction not found' });
    }

    const rental = transaction.rentalId;
    if (!rental) return res.status(400).json({ msg: 'No rental associated' });

    if (rental.returnStatus !== 'PENDING_RETURN') {
      return res.status(400).json({ msg: 'Return already requested/processed' });
    }

    rental.returnDate = new Date();
    rental.returnStatus = 'RETURN_REQUESTED';
    rental.buyerNote = note || '';
    rental.calculatePenalty();
    if (rental.penaltyAmount > 0) {
      rental.penaltyPaymentStatus = 'UNPAID';
      rental.penaltyPaidAt = undefined;
      rental.penaltyPaymentRef = '';
    } else {
      rental.penaltyPaymentStatus = 'NOT_REQUIRED';
    }
    await rental.save();

    await createNotification({
      userId: transaction.ownerId,
      type: 'RETURN_REQUESTED',
      title: 'Return requested',
      message: 'Buyer requested return for a rental item.',
      link: '/user/rentals',
      meta: { transactionId: transaction._id, rentalId: rental._id }
    });

    res.json({ msg: 'Return requested. Waiting for seller confirmation.', rental });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

// Seller confirms return
exports.confirmReturn = async (req, res) => {
  try {
    const { transactionId, note } = req.body;
    if (!transactionId) {
      return res.status(400).json({ msg: 'transactionId is required' });
    }

    const transaction = await Transaction.findById(transactionId)
      .populate('rentalId')
      .populate('productId');

    if (!transaction || transaction.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized or transaction not found' });
    }

    const rental = transaction.rentalId;
    if (!rental) return res.status(400).json({ msg: 'No rental found' });

    if (rental.returnStatus !== 'RETURN_REQUESTED') {
      return res.status(400).json({ msg: 'Buyer has not requested return yet' });
    }
    if (rental.penaltyAmount > 0 && !['PAID', 'WAIVED'].includes(rental.penaltyPaymentStatus)) {
      return res.status(400).json({ msg: 'Penalty payment pending. Buyer must clear penalty first.' });
    }

    rental.returnStatus = 'RETURNED';
    rental.status = 'completed';
    rental.sellerNote = note || '';
    await rental.save();

    // Make product available again
    const product = transaction.productId;
    product.status = 'approved';
    product.isActive = true;
    await product.save();

    await createNotification({
      userId: transaction.buyerId,
      type: 'RETURN_CONFIRMED',
      title: 'Return confirmed',
      message: 'Seller confirmed your return.',
      link: '/user/rentals',
      meta: { transactionId: transaction._id, rentalId: rental._id }
    });

    res.json({ msg: 'Return confirmed. Product is now available again.', rental });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

// Buyer pays penalty (simulated)
exports.payPenalty = async (req, res) => {
  try {
    const { transactionId } = req.body;
    if (!transactionId) {
      return res.status(400).json({ msg: 'transactionId is required' });
    }

    const transaction = await Transaction.findById(transactionId).populate('rentalId');
    if (!transaction || transaction.buyerId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized or transaction not found' });
    }

    const rental = transaction.rentalId;
    if (!rental) {
      return res.status(400).json({ msg: 'No rental associated' });
    }

    if (rental.returnStatus !== 'RETURN_REQUESTED') {
      return res.status(400).json({ msg: 'Penalty can be paid only after return request' });
    }

    if (Number(rental.penaltyAmount || 0) <= 0) {
      rental.penaltyPaymentStatus = 'NOT_REQUIRED';
      await rental.save();
      return res.json({ msg: 'No penalty due for this rental', rental });
    }

    if (rental.penaltyPaymentStatus === 'PAID') {
      return res.json({ msg: 'Penalty is already paid', rental });
    }

    rental.penaltyPaymentStatus = 'PAID';
    rental.penaltyPaidAt = new Date();
    rental.penaltyPaymentRef = generatePenaltyRef();
    await rental.save();
    await recordPenaltyCredit({
      ownerId: transaction.ownerId,
      buyerId: transaction.buyerId,
      amount: rental.penaltyAmount,
      transactionId: transaction._id,
      rentalId: rental._id,
      paymentRef: rental.penaltyPaymentRef
    });

    await createNotification({
      userId: transaction.ownerId,
      type: 'PENALTY_PAID',
      title: 'Penalty paid',
      message: 'Buyer paid the late penalty for a rental.',
      link: '/user/rentals',
      meta: { transactionId: transaction._id, rentalId: rental._id, amount: rental.penaltyAmount }
    });

    return res.json({
      msg: 'Penalty payment successful',
      penaltyAmount: rental.penaltyAmount,
      paymentRef: rental.penaltyPaymentRef,
      rental
    });
  } catch (err) {
    return res.status(500).json({ msg: 'Server error' });
  }
};

// Get My Rentals (for buyer or seller)
exports.getMyRentals = async (req, res) => {
  try {
    const { type } = req.query; // 'buyer' or 'seller'

    const query = type === 'seller' 
      ? { ownerId: req.user.id } 
      : { buyerId: req.user.id };

    // Backfill: older transactions might be rent deals without rentalId due to previous validation mismatch.
    const repairCandidates = await Transaction.find({
      ...query,
      $or: [{ rentalId: { $exists: false } }, { rentalId: null }]
    })
      .populate('offerId', 'offerType rentStartDate rentEndDate')
      .select('_id offerId productId buyerId ownerId latePenaltyPerDay')
      .lean();

    for (const tx of repairCandidates) {
      const isRentOffer = tx.offerId?.offerType?.toUpperCase?.() === 'RENT';
      const hasDates = !!tx.offerId?.rentStartDate && !!tx.offerId?.rentEndDate;
      if (!isRentOffer || !hasDates) {
        continue;
      }

      const existingRental = await Rental.findOne({ transactionId: tx._id }).select('_id').lean();
      const rentalIdToLink = existingRental?._id
        ? existingRental._id
        : (await Rental.create({
            transactionId: tx._id,
            productId: tx.productId,
            renterId: tx.buyerId,
            ownerId: tx.ownerId,
            startDate: new Date(tx.offerId.rentStartDate),
            endDate: new Date(tx.offerId.rentEndDate),
            returnStatus: 'PENDING_RETURN',
            penaltyAmount: 0,
            penaltyPaymentStatus: 'NOT_REQUIRED',
            latePenaltyPerDay: Number(tx.latePenaltyPerDay || 0)
          }))._id;

      await Transaction.findByIdAndUpdate(tx._id, { rentalId: rentalIdToLink });
    }

    const transactions = await Transaction.find(query)
      .populate({
        path: 'rentalId',
        select: 'startDate endDate returnDate penaltyAmount penaltyPaymentStatus penaltyPaidAt penaltyPaymentRef returnStatus buyerNote sellerNote'
      })
      .populate('productId', 'name photos type')
      .sort({ createdAt: -1 })
      .lean();

    const rentals = transactions
      .filter(t => t.rentalId)
      .map((t) => ({
        ...t,
        transactionId: t._id?.toString?.() || t._id
      }));

    res.json(rentals);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};
