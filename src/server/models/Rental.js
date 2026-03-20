const mongoose = require('mongoose');

const rentalSchema = new mongoose.Schema(
  {
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    renterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    returnDate: {
      type: Date
    },
    returnStatus: {
      type: String,
      enum: ['PENDING_RETURN', 'RETURN_REQUESTED', 'RETURNED'],
      default: 'PENDING_RETURN'
    },
    penaltyAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    penaltyPaymentStatus: {
      type: String,
      enum: ['NOT_REQUIRED', 'UNPAID', 'PAID', 'WAIVED'],
      default: 'NOT_REQUIRED'
    },
    penaltyPaidAt: {
      type: Date
    },
    penaltyPaymentRef: {
      type: String,
      default: ''
    },
    buyerNote: {
      type: String,
      default: ''
    },
    sellerNote: {
      type: String,
      default: ''
    },
    latePenaltyPerDay: {
      type: Number,
      default: 0,
      min: 0
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active'
    }
  },
  { timestamps: true }
);

rentalSchema.methods.calculatePenalty = function () {
  if (!this.returnDate || !this.endDate) {
    this.penaltyAmount = 0;
    return this.penaltyAmount;
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const lateMs = new Date(this.returnDate).getTime() - new Date(this.endDate).getTime();
  const lateDays = Math.max(0, Math.ceil(lateMs / msPerDay));
  this.penaltyAmount = lateDays * Number(this.latePenaltyPerDay || 0);
  return this.penaltyAmount;
};

module.exports = mongoose.model('Rental', rentalSchema);
