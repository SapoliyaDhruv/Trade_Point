const WalletLedger = require('../models/WalletLedger');

const roundMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.round(num));
};

const toId = (value) => (value ? String(value) : '');

const createEscrowBase = (transaction) => ({
  userId: transaction.ownerId,
  direction: 'CREDIT',
  entryType: 'ESCROW',
  amount: roundMoney(transaction.ownerAmount),
  transactionId: transaction._id,
  counterpartyUserId: transaction.buyerId,
  reference: transaction.transactionId || '',
  description: 'Buyer payment in escrow awaiting admin review'
});

exports.recordEscrowPending = async (transaction) => {
  try {
    if (!transaction?._id || !transaction?.ownerId) return null;
    const base = createEscrowBase(transaction);
    if (!base.amount) return null;

    const dedupeKey = `escrow:${toId(transaction._id)}`;
    return await WalletLedger.findOneAndUpdate(
      { dedupeKey },
      {
        $setOnInsert: {
          ...base,
          status: 'PENDING',
          dedupeKey
        },
        $set: {
          reference: transaction.transactionId || ''
        }
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error('Wallet ledger pending escrow write failed:', err.message);
    return null;
  }
};

exports.resolveEscrowEntry = async (transaction, { approved }) => {
  try {
    if (!transaction?._id || !transaction?.ownerId) return null;
    const base = createEscrowBase(transaction);
    if (!base.amount) return null;

    const nextStatus = approved ? 'POSTED' : 'REVERSED';
    const dedupeKey = `escrow:${toId(transaction._id)}`;

    return await WalletLedger.findOneAndUpdate(
      { dedupeKey },
      {
        $setOnInsert: {
          ...base,
          dedupeKey
        },
        $set: {
          status: nextStatus,
          settledAt: new Date(),
          reference: transaction.transactionId || '',
          description: approved
            ? 'Escrow released after admin approval'
            : 'Escrow reversed after admin rejection'
        }
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error('Wallet ledger escrow resolution failed:', err.message);
    return null;
  }
};

exports.recordWithdrawalDebit = async (withdrawal) => {
  try {
    if (!withdrawal?._id || !withdrawal?.userId) return null;
    const amount = roundMoney(withdrawal.amount);
    if (!amount) return null;

    const dedupeKey = `withdrawal:${toId(withdrawal._id)}`;
    return await WalletLedger.findOneAndUpdate(
      { dedupeKey },
      {
        $setOnInsert: {
          userId: withdrawal.userId,
          direction: 'DEBIT',
          entryType: 'WITHDRAWAL',
          status: 'POSTED',
          amount,
          withdrawalId: withdrawal._id,
          reference: withdrawal.reference || '',
          description: withdrawal.note || 'Wallet withdrawal',
          dedupeKey,
          settledAt: withdrawal.createdAt || new Date()
        }
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error('Wallet ledger withdrawal write failed:', err.message);
    return null;
  }
};

exports.recordPenaltyCredit = async ({
  ownerId,
  buyerId,
  amount,
  transactionId,
  rentalId,
  paymentRef
}) => {
  try {
    const normalizedAmount = roundMoney(amount);
    if (!ownerId || !normalizedAmount) return null;

    const dedupeKey = `penalty:${toId(rentalId) || toId(transactionId)}:${String(paymentRef || '')}`;
    return await WalletLedger.findOneAndUpdate(
      { dedupeKey },
      {
        $setOnInsert: {
          userId: ownerId,
          direction: 'CREDIT',
          entryType: 'PENALTY',
          status: 'POSTED',
          amount: normalizedAmount,
          transactionId: transactionId || undefined,
          rentalId: rentalId || undefined,
          counterpartyUserId: buyerId || undefined,
          reference: paymentRef || '',
          description: 'Late return penalty credited',
          settledAt: new Date(),
          dedupeKey
        }
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error('Wallet ledger penalty write failed:', err.message);
    return null;
  }
};
