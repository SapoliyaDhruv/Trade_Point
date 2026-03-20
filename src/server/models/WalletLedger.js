    const mongoose = require('mongoose');

const walletLedgerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    direction: {
      type: String,
      enum: ['CREDIT', 'DEBIT'],
      required: true
    },
    entryType: {
      type: String,
      enum: ['ESCROW', 'PENALTY', 'WITHDRAWAL', 'ADJUSTMENT'],
      required: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'POSTED', 'REVERSED'],
      default: 'POSTED'
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction'
    },
    rentalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rental'
    },
    withdrawalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Withdrawal'
    },
    counterpartyUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reference: {
      type: String,
      default: ''
    },
    description: {
      type: String,
      default: ''
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    dedupeKey: {
      type: String,
      index: true,
      unique: true,
      sparse: true
    },
    settledAt: {
      type: Date
    }
  },
  { timestamps: true }
);

walletLedgerSchema.index({ userId: 1, createdAt: -1 });
walletLedgerSchema.index({ userId: 1, status: 1, entryType: 1 });

module.exports = mongoose.model('WalletLedger', walletLedgerSchema);
