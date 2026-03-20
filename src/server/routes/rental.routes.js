const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { requestReturn, confirmReturn, payPenalty, getMyRentals } = require('../controllers/rental.controller');

router.put('/request-return', verifyToken, requestReturn);
router.put('/confirm-return', verifyToken, confirmReturn);
router.put('/pay-penalty', verifyToken, payPenalty);
router.get('/my', verifyToken, getMyRentals);

module.exports = router;
