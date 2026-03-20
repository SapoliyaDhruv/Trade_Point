const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  offerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Offer', 
    required: true 
  },
  productId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  },
  buyerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  ownerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  totalAmount: { type: Number, required: true },
  platformFee: { type: Number, required: true },
  ownerAmount: { type: Number, required: true },
  
  paymentStatus: { 
    type: String, 
    enum: [
      'AWAITING_PAYMENT',           // After deal is accepted (waiting for buyer to pay)
      'PAID_AWAITING_ADMIN',        // Buyer paid (fake/real) → now waiting for admin
      'APPROVED',                   // Admin approved → deal complete
      'REJECTED_BY_ADMIN'           // Admin rejected
    ],
    default: 'AWAITING_PAYMENT'
  },
  
  adminNote: { type: String },
  approvedAt: { type: Date },
  rejectedAt: { type: Date },
  rentalId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Rental'
},
latePenaltyPerDay: { type: Number, default: 0 },
  
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);