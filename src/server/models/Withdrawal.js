const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 1
    },
    method: {
      type: String,
      enum: ['BANK_TRANSFER', 'UPI_TRANSFER', 'SIMULATED_TRANSFER'],
      default: 'SIMULATED_TRANSFER'
    },
    status: {
      type: String,
      enum: ['COMPLETED'],
      default: 'COMPLETED'
    },
    reference: {
      type: String,
      required: true
    },
    note: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

withdrawalSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
