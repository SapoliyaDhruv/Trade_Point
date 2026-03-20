const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
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

  offerType: {
    type: String,
    enum: ['SELL', 'RENT'],
    required: true
  },

  offerAmount: {
    type: Number,
    required: true
  },

  rentStartDate: { type: Date },
  rentEndDate:   { type: Date },

  message: { type: String },

  status: {
    type: String,
    enum: [
      'PENDING',
      'COUNTERED',
      'ACCEPTED',       // ← added (this was missing)
      'APPROVED',       // optional – if you want to keep distinction
      'REJECTED'
    ],
    default: 'PENDING'
  },

  counterAmount:  { type: Number },
  counterMessage: { type: String },

  history: [
    {
      message: String,
      from: { type: String, enum: ['buyer', 'owner'] },
      timestamp: { type: Date, default: Date.now }
    }
  ]

}, { timestamps: true });

// Optional pre-save validation for rent offers
offerSchema.pre('save', async function () {
  if (this.offerType === 'RENT') {
    if (!this.rentStartDate || !this.rentEndDate) {
      throw new Error('Rent start and end dates are required for rent offers');
    }
    if (this.rentStartDate >= this.rentEndDate) {
      throw new Error('Rent start date must be before end date');
    }
  }
});

module.exports = mongoose.model('Offer', offerSchema);  