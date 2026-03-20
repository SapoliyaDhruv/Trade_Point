const Offer = require('../models/Offer');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const Rental = require('../models/Rental');
const { createNotification } = require('../utils/notify');
const { recordEscrowPending } = require('../utils/wallet-ledger');

const RENT_STATUSES_TO_BLOCK = ['APPROVED', 'ACCEPTED'];

const getRentDays = (startDate, endDate) => {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / msPerDay));
};

const validateRentWindow = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, msg: 'Invalid rent dates' };
  }
  if (start >= end) {
    return { ok: false, msg: 'Start date must be before end date' };
  }
  return { ok: true, start, end };
};

const hasRentConflict = async ({ productId, start, end, excludeOfferId = null }) => {
  const rentalConflict = await Rental.exists({
    productId,
    startDate: { $lt: end },
    endDate: { $gt: start },
    returnStatus: { $ne: 'RETURNED' }
  });

  const offerQuery = {
    productId,
    status: { $in: RENT_STATUSES_TO_BLOCK },
    rentStartDate: { $lt: end },
    rentEndDate: { $gt: start }
  };
  if (excludeOfferId) {
    offerQuery._id = { $ne: excludeOfferId };
  }
  const offerConflict = await Offer.exists(offerQuery);

  return Boolean(rentalConflict || offerConflict);
};

const createTransactionForOffer = async ({ offer, totalAmount }) => {
  const platformFee = Math.round(totalAmount * 0.10);
  const ownerAmount = totalAmount - platformFee;
  const penaltyProduct = await Product.findById(offer.productId).select('latePenaltyPerDay').lean();
  const latePenaltyPerDay = Number(penaltyProduct?.latePenaltyPerDay || 0);

  const transaction = new Transaction({
    offerId: offer._id,
    productId: offer.productId,
    buyerId: offer.buyerId,
    ownerId: offer.ownerId,
    totalAmount,
    platformFee,
    ownerAmount,
    latePenaltyPerDay,
    paymentStatus: 'AWAITING_PAYMENT'
  });

  await transaction.save();
  return transaction;
};

const maybeCreateRental = async ({ offer, transaction }) => {
  if (offer.offerType?.toUpperCase() !== 'RENT') {
    return null;
  }

  const rental = await Rental.create({
    transactionId: transaction._id,
    productId: offer.productId,
    renterId: offer.buyerId,
    ownerId: offer.ownerId,
    startDate: new Date(offer.rentStartDate),
    endDate: new Date(offer.rentEndDate),
    returnStatus: 'PENDING_RETURN',
    penaltyAmount: 0,
    latePenaltyPerDay: Number(transaction.latePenaltyPerDay || 0)
  });

  transaction.rentalId = rental._id;
  await transaction.save();
  return rental;
};

exports.createOffer = async (req, res) => {
  try {
    const { productId, offerType, offerAmount, rentStartDate, rentEndDate, message } = req.body;
    const buyerId = req.user.id;

    if (!productId || !offerType || !offerAmount) {
      return res.status(400).json({ msg: 'Missing required fields' });
    }

    const normalizedOfferAmount = Number(offerAmount);
    if (!Number.isFinite(normalizedOfferAmount) || normalizedOfferAmount <= 0) {
      return res.status(400).json({ msg: 'Offer amount must be a valid number greater than 0' });
    }

    const normalizedOfferType = String(offerType).toUpperCase().trim();
    if (!['SELL', 'RENT'].includes(normalizedOfferType)) {
      return res.status(400).json({ msg: 'Invalid offer type. Must be SELL or RENT.' });
    }

    const product = await Product.findById(productId).populate('seller');
    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }
    if (product.status !== 'approved' || !product.isActive) {
      return res.status(400).json({ msg: 'Product not available for offers' });
    }
    if (product.seller._id.toString() === buyerId) {
      return res.status(400).json({ msg: 'Cannot offer on your own product' });
    }
    if (
      (normalizedOfferType === 'SELL' && product.type !== 'sale') ||
      (normalizedOfferType === 'RENT' && product.type !== 'rent')
    ) {
      return res.status(400).json({ msg: `Product is for ${product.type}, offer type mismatch` });
    }

    if (normalizedOfferType === 'SELL') {
      const minSalePrice = Number(product.salePriceMin || 0);
      if (normalizedOfferAmount < minSalePrice) {
        return res.status(400).json({
          msg: `Offer price cannot be lower than minimum sale price (Rs. ${minSalePrice})`
        });
      }
    }

    if (normalizedOfferType === 'RENT') {
      const fixedRentPrice = Number(product.rentPricePerDay || 0);
      if (fixedRentPrice <= 0) {
        return res.status(400).json({ msg: 'Invalid fixed rent price for this product' });
      }

      // Rent offers are fixed to product daily rent price.
      if (normalizedOfferAmount !== fixedRentPrice) {
        return res.status(400).json({
          msg: `Rent offer amount is fixed at Rs. ${fixedRentPrice} per day`
        });
      }
    }

    let normalizedRentStartDate;
    let normalizedRentEndDate;
    if (normalizedOfferType === 'RENT') {
      if (!rentStartDate || !rentEndDate) {
        return res.status(400).json({ msg: 'Rent dates required for rent offers' });
      }

      const dateCheck = validateRentWindow(rentStartDate, rentEndDate);
      if (!dateCheck.ok) {
        return res.status(400).json({ msg: dateCheck.msg });
      }
      normalizedRentStartDate = dateCheck.start;
      normalizedRentEndDate = dateCheck.end;

      const conflict = await hasRentConflict({
        productId,
        start: normalizedRentStartDate,
        end: normalizedRentEndDate
      });
      if (conflict) {
        return res.status(409).json({ msg: 'Selected rental dates are not available' });
      }
    }

    const offer = new Offer({
      productId,
      buyerId,
      ownerId: product.seller._id,
      offerType: normalizedOfferType,
      offerAmount: normalizedOfferAmount,
      rentStartDate: normalizedOfferType === 'RENT' ? normalizedRentStartDate : undefined,
      rentEndDate: normalizedOfferType === 'RENT' ? normalizedRentEndDate : undefined,
      message,
      history: message ? [{ message, from: 'buyer', timestamp: new Date() }] : []
    });

    await offer.save();

    await createNotification({
      userId: product.seller._id,
      type: 'OFFER_RECEIVED',
      title: 'New offer received',
      message: `You received a new offer on "${product.name}".`,
      link: '/user/offers',
      meta: { offerId: offer._id, productId }
    });

    res.status(201).json({ msg: 'Offer sent successfully', offer });
  } catch (err) {
    console.error('Create Offer Error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.getReceivedOffers = async (req, res) => {
  try {
    const offers = await Offer.find({
      ownerId: req.user.id,
      status: 'PENDING'
    })
      .populate('productId', 'name photos')
      .populate('buyerId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();

    res.json(offers);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.approveOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer || offer.ownerId.toString() !== req.user.id) {
      return res.status(404).json({ msg: 'Offer not found or unauthorized' });
    }
    if (offer.status !== 'PENDING') {
      return res.status(400).json({ msg: 'Offer already processed' });
    }

    if (offer.offerType === 'RENT') {
      const dateCheck = validateRentWindow(offer.rentStartDate, offer.rentEndDate);
      if (!dateCheck.ok) {
        return res.status(400).json({ msg: dateCheck.msg });
      }
      const conflict = await hasRentConflict({
        productId: offer.productId,
        start: dateCheck.start,
        end: dateCheck.end,
        excludeOfferId: offer._id
      });
      if (conflict) {
        return res.status(409).json({ msg: 'This rental slot is no longer available' });
      }
    }

    let rejectedOffers = [];
    if (offer.offerType === 'RENT') {
      rejectedOffers = await Offer.find({
        productId: offer.productId,
        _id: { $ne: offer._id },
        status: 'PENDING',
        rentStartDate: { $lt: offer.rentEndDate },
        rentEndDate: { $gt: offer.rentStartDate }
      }).select('_id buyerId');

      await Offer.updateMany(
        {
          productId: offer.productId,
          _id: { $ne: offer._id },
          status: 'PENDING',
          rentStartDate: { $lt: offer.rentEndDate },
          rentEndDate: { $gt: offer.rentStartDate }
        },
        { status: 'REJECTED' }
      );
    } else {
      rejectedOffers = await Offer.find({
        productId: offer.productId,
        _id: { $ne: offer._id },
        status: 'PENDING'
      }).select('_id buyerId');

      await Offer.updateMany(
        { productId: offer.productId, _id: { $ne: offer._id }, status: 'PENDING' },
        { status: 'REJECTED' }
      );
    }

    offer.status = 'APPROVED';
    offer.history.push({
      message: 'Offer approved by seller',
      from: 'owner',
      timestamp: new Date()
    });
    await offer.save();

    let totalAmount = Number(offer.offerAmount);
    if (offer.offerType === 'RENT') {
      totalAmount = Number(offer.offerAmount) * getRentDays(offer.rentStartDate, offer.rentEndDate);
    }

    const transaction = await createTransactionForOffer({ offer, totalAmount });
    const rental = await maybeCreateRental({ offer, transaction });

    await createNotification({
      userId: offer.buyerId,
      type: 'OFFER_APPROVED',
      title: 'Offer approved',
      message: 'Your offer was approved. Complete payment to continue.',
      link: '/user/my-offers',
      meta: { offerId: offer._id, transactionId: transaction._id }
    });

    await Promise.all(
      rejectedOffers.map((item) =>
        createNotification({
          userId: item.buyerId,
          type: 'OFFER_REJECTED',
          title: 'Offer not accepted',
          message: 'Your offer was not selected.',
          link: '/user/my-offers',
          meta: { offerId: item._id, productId: offer.productId }
        })
      )
    );

    res.json({
      msg: 'Offer approved. Buyer can now pay.',
      transactionId: transaction._id.toString(),
      totalAmount,
      paymentStatus: transaction.paymentStatus,
      rentalId: rental?._id?.toString() || null
    });
  } catch (err) {
    console.error('Approve Offer Error:', err);
    res.status(500).json({ msg: 'Server error while approving offer' });
  }
};

exports.rejectOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer || offer.ownerId.toString() !== req.user.id) {
      return res.status(404).json({ msg: 'Offer not found or unauthorized' });
    }
    if (offer.status !== 'PENDING') {
      return res.status(400).json({ msg: 'Offer already processed' });
    }

    offer.status = 'REJECTED';
    offer.history.push({
      message: 'Offer rejected by seller',
      from: 'owner',
      timestamp: new Date()
    });
    await offer.save();

    await createNotification({
      userId: offer.buyerId,
      type: 'OFFER_REJECTED',
      title: 'Offer rejected',
      message: 'The seller rejected your offer.',
      link: '/user/my-offers',
      meta: { offerId: offer._id }
    });

    res.json({ msg: 'Offer rejected' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.counterOffer = async (req, res) => {
  try {
    const { counterAmount, counterMessage } = req.body;
    const amount = Number(counterAmount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ msg: 'Valid counter amount is required' });
    }

    const offer = await Offer.findById(req.params.id);
    if (!offer || offer.ownerId.toString() !== req.user.id) {
      return res.status(404).json({ msg: 'Offer not found or unauthorized' });
    }
    if (offer.status !== 'PENDING') {
      return res.status(400).json({ msg: 'Offer already processed' });
    }

    if (offer.offerType === 'RENT') {
      return res.status(400).json({ msg: 'Rent offers are fixed-price. Counter offers are not allowed.' });
    }

    offer.counterAmount = amount;
    offer.counterMessage = counterMessage || '';
    offer.status = 'COUNTERED';
    offer.history.push({
      message: counterMessage || `Counter offer: ${amount}`,
      from: 'owner',
      timestamp: new Date()
    });
    await offer.save();

    await createNotification({
      userId: offer.buyerId,
      type: 'COUNTER_OFFER',
      title: 'Counter offer received',
      message: 'Seller sent a counter offer.',
      link: '/user/my-offers',
      meta: { offerId: offer._id }
    });

    res.json({ msg: 'Counter offer sent successfully' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.getMySentOffers = async (req, res) => {
  try {
    const offers = await Offer.find({ buyerId: req.user.id })
      .populate('productId', 'name photos')
      .populate('ownerId', 'firstName lastName')
      .sort({ updatedAt: -1 })
      .lean();

    const txByOfferId = new Map();
    if (offers.length) {
      const txs = await Transaction.find({
        offerId: { $in: offers.map((o) => o._id) }
      })
        .select('_id offerId totalAmount paymentStatus latePenaltyPerDay')
        .lean();

      txs.forEach((tx) => txByOfferId.set(String(tx.offerId), tx));
    }

    const merged = offers.map((offer) => {
      const tx = txByOfferId.get(String(offer._id));
      if (!tx) {
        return offer;
      }
      return {
        ...offer,
        transactionId: tx._id.toString(),
        totalAmount: tx.totalAmount,
        paymentStatus: tx.paymentStatus,
        latePenaltyPerDay: tx.latePenaltyPerDay || 0
      };
    });

    res.json(merged);
  } catch (err) {
    console.error('Get My Sent Offers Error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.acceptCounter = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) {
      return res.status(404).json({ msg: 'Offer not found' });
    }
    if (offer.buyerId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not your offer' });
    }
    if (offer.status !== 'COUNTERED') {
      return res.status(400).json({ msg: 'No counter to accept' });
    }

    if (offer.offerType === 'RENT') {
      const dateCheck = validateRentWindow(offer.rentStartDate, offer.rentEndDate);
      if (!dateCheck.ok) {
        return res.status(400).json({ msg: dateCheck.msg });
      }
      const conflict = await hasRentConflict({
        productId: offer.productId,
        start: dateCheck.start,
        end: dateCheck.end,
        excludeOfferId: offer._id
      });
      if (conflict) {
        return res.status(409).json({ msg: 'This rental slot is no longer available' });
      }
    }

    offer.status = 'ACCEPTED';
    offer.history.push({
      message: 'Counter offer accepted by buyer',
      from: 'buyer',
      timestamp: new Date()
    });
    await offer.save();

    let totalAmount = Number(offer.counterAmount || offer.offerAmount);
    if (offer.offerType === 'RENT') {
      totalAmount *= getRentDays(offer.rentStartDate, offer.rentEndDate);
    }

    const transaction = await createTransactionForOffer({ offer, totalAmount });
    const rental = await maybeCreateRental({ offer, transaction });

    await createNotification({
      userId: offer.ownerId,
      type: 'COUNTER_ACCEPTED',
      title: 'Counter accepted',
      message: 'Buyer accepted your counter offer.',
      link: '/user/offers',
      meta: { offerId: offer._id, transactionId: transaction._id }
    });

    res.json({
      msg: 'Counter accepted. Proceed to payment.',
      transactionId: transaction._id.toString(),
      totalAmount,
      paymentStatus: transaction.paymentStatus,
      rentalId: rental?._id?.toString() || null
    });
  } catch (err) {
    console.error('Accept Counter Error:', err);
    res.status(500).json({ msg: 'Server error while accepting counter' });
  }
};

exports.rejectCounter = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer || offer.buyerId.toString() !== req.user.id) {
      return res.status(404).json({ msg: 'Offer not found or unauthorized' });
    }
    if (offer.status !== 'COUNTERED') {
      return res.status(400).json({ msg: 'No counter to reject' });
    }

    offer.status = 'REJECTED';
    offer.history.push({
      message: 'Counter offer rejected by buyer',
      from: 'buyer',
      timestamp: new Date()
    });
    await offer.save();

    await createNotification({
      userId: offer.ownerId,
      type: 'COUNTER_REJECTED',
      title: 'Counter rejected',
      message: 'Buyer rejected your counter offer.',
      link: '/user/offers',
      meta: { offerId: offer._id }
    });

    res.json({ msg: 'Counter rejected' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.processPayment = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.transactionId);
    if (!transaction) {
      return res.status(404).json({ msg: 'Transaction not found' });
    }
    if (transaction.buyerId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not your transaction' });
    }
    if (transaction.paymentStatus !== 'AWAITING_PAYMENT') {
      return res.status(400).json({ msg: 'Transaction not awaiting payment' });
    }

    transaction.paymentStatus = 'PAID_AWAITING_ADMIN';
    transaction.transactionId = `sim_${Date.now()}`;
    await transaction.save();
    await recordEscrowPending(transaction);

    await createNotification({
      userId: transaction.ownerId,
      type: 'PAYMENT_SUBMITTED',
      title: 'Payment submitted',
      message: 'Buyer completed payment. Awaiting admin approval.',
      link: '/user/offers',
      meta: { transactionId: transaction._id, offerId: transaction.offerId }
    });

    res.json({
      msg: 'Payment processed. Awaiting admin approval.',
      transaction
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.getOfferMessages = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id)
      .populate('buyerId', 'firstName lastName')
      .populate('ownerId', 'firstName lastName')
      .populate('productId', 'name');

    if (!offer) {
      return res.status(404).json({ msg: 'Offer not found' });
    }

    const userId = req.user.id;
    const isBuyer = offer.buyerId?._id?.toString() === userId;
    const isOwner = offer.ownerId?._id?.toString() === userId;
    if (!isBuyer && !isOwner) {
      return res.status(403).json({ msg: 'Not allowed' });
    }

    res.json({
      offerId: offer._id,
      status: offer.status,
      product: offer.productId,
      buyer: offer.buyerId,
      owner: offer.ownerId,
      currentUserSide: isBuyer ? 'buyer' : 'owner',
      messages: offer.history || []
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.sendOfferMessage = async (req, res) => {
  try {
    const text = String(req.body?.message || '').trim();
    if (!text) {
      return res.status(400).json({ msg: 'Message is required' });
    }

    const offer = await Offer.findById(req.params.id).select(
      '_id buyerId ownerId history productId'
    );
    if (!offer) {
      return res.status(404).json({ msg: 'Offer not found' });
    }

    const userId = req.user.id;
    const isBuyer = offer.buyerId.toString() === userId;
    const isOwner = offer.ownerId.toString() === userId;
    if (!isBuyer && !isOwner) {
      return res.status(403).json({ msg: 'Not allowed' });
    }

    const from = isBuyer ? 'buyer' : 'owner';
    const messageDoc = {
      message: text,
      from,
      timestamp: new Date()
    };
    offer.history.push(messageDoc);
    await offer.save();

    const recipientId = isBuyer ? offer.ownerId : offer.buyerId;
    await createNotification({
      userId: recipientId,
      type: 'OFFER_MESSAGE',
      title: 'New offer message',
      message: 'You received a new message on an offer.',
      link: `/user/offer-chat/${offer._id}`,
      meta: { offerId: offer._id, productId: offer.productId }
    });

    res.status(201).json({
      msg: 'Message sent',
      message: messageDoc
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};
