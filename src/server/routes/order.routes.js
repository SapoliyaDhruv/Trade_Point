// src/server/routes/order.routes.js

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const Transaction = require('../models/Transaction');

// GET /api/orders/my - Get current user's orders (as buyer)
router.get('/my', verifyToken, async (req, res) => {
  try {
    const orders = await Transaction.find({
      buyerId: req.user.id   // only orders where user is the buyer
    })
      .populate({
        path: 'productId',
        select: 'name photos type'   // bring name and first photo
      })
      .populate('offerId', 'offerType offerAmount')  // optional
      .sort({ createdAt: -1 })   // newest first
      .lean();   // faster response

    res.status(200).json(orders);
  } catch (err) {
    console.error('Error fetching user orders:', err);
    res.status(500).json({ msg: 'Server error while fetching orders' });
  }
});

module.exports = router;