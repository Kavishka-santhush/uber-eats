const prisma = require('../config/prisma');
const { money, num } = require('../lib/misc');

/**
 * Wallet ledger — all balance changes go through here inside a
 * transaction with a WalletTransaction row (double-entry style audit).
 */

async function ensureWallet(userId) {
  return prisma.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

/**
 * Credit/debit atomically. amount > 0 credit, amount < 0 debit.
 * Throws when debiting more than the available balance.
 */
async function adjustWallet(userId, amount, type, reference, note, tx) {
  const client = tx || prisma;
  const wallet = await ensureWallet(userId);
  const next = money(num(wallet.balance) + Number(amount));
  if (next < 0) {
    const e = new Error('Insufficient wallet balance');
    e.extensions = { code: 'BAD_USER_INPUT' };
    throw e;
  }
  const [updated] = await Promise.all([
    client.wallet.update({ where: { userId }, data: { balance: next } }),
    client.walletTransaction.create({
      data: { walletId: wallet.id, type, amount: money(amount), balanceAfter: next, reference, note },
    }),
  ]);
  return updated;
}

const creditWallet = (userId, amount, type = 'ADMIN_ADJUSTMENT', reference, note) =>
  adjustWallet(userId, Math.abs(Number(amount)), type, reference, note);

const debitWallet = (userId, amount, type = 'ORDER_PAYMENT', reference, note) =>
  adjustWallet(userId, -Math.abs(Number(amount)), type, reference, note);

async function walletHistory(userId, { take = 30 } = {}) {
  const w = await ensureWallet(userId);
  return {
    balance: w.balance,
    currency: w.currency,
    transactions: await prisma.walletTransaction.findMany({
      where: { walletId: w.id }, orderBy: { createdAt: 'desc' }, take,
    }),
  };
}

module.exports = { ensureWallet, adjustWallet, creditWallet, debitWallet, walletHistory };
