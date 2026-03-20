const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  ageYears: { type: Number, min: 0, required: true },
  description: { type: String, required: true },
  location: { type: String, required: true },

  type: { type: String, enum: ['sale', 'rent'], required: true },

  salePriceMin: { type: Number, min: 0 },
  salePriceMax: { type: Number, min: 0 },

  rentPricePerHour:  { type: Number, min: 0 },
  rentPricePerDay:   { type: Number, min: 0 },
  latePenaltyPerDay: { type: Number, min: 0 },

  photos:       [{ type: String }], 
  billPhotos:   [{ type: String }], 

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'sold', 'rented_out'],
    default: 'pending'
  },

  platformFee: {
    type: Number,
    default: 0
  },
  sellerPayout: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true,
    required: true
  },
  feePercentage: {
    type: Number,
    default: 10  // 10%
  },
  moderationStatus: {
    type: String,
    enum: ['clean', 'flagged'],
    default: 'clean'
  },
  moderationFlags: {
    type: [String],
    default: []
  },

}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
