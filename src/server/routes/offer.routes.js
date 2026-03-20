const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');

const {
  createOffer,
  getReceivedOffers,
  approveOffer,
  rejectOffer,
  counterOffer,
  processPayment,
  getMySentOffers,
  acceptCounter,
  rejectCounter,
  getOfferMessages,
  sendOfferMessage
} = require('../controllers/offer.controller');

router.post('/', verifyToken, createOffer);
router.get('/received', verifyToken, getReceivedOffers);

router.put('/:id/approve', verifyToken, approveOffer);
router.put('/:id/reject', verifyToken, rejectOffer);
router.put('/:id/counter', verifyToken, counterOffer);

router.get('/my-sent', verifyToken, getMySentOffers);
router.put('/:id/accept-counter', verifyToken, acceptCounter);
router.put('/:id/reject-counter', verifyToken, rejectCounter);

router.get('/:id/messages', verifyToken, getOfferMessages);
router.post('/:id/messages', verifyToken, sendOfferMessage);

router.put('/payment/:transactionId', verifyToken, processPayment);

module.exports = router;
