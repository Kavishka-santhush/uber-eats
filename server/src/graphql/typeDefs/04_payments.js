const { gql } = require('graphql-tag');

/** Wallet, payments, refunds, promo codes, loyalty, payouts. */

module.exports = gql`
  type Wallet {
    id: ID!
    balance: Decimal!
    currency: String!
    transactions(page: Int, limit: Int): WalletTransactionPage!
  }

  type WalletTransaction {
    id: ID!
    type: TransactionType!
    amount: Decimal!
    balanceAfter: Decimal!
    reference: String
    note: String
    createdAt: DateTime!
  }

  type WalletTransactionPage { items: [WalletTransaction!]!, total: Int!, page: Int!, pages: Int! }

  type Payment {
    id: ID!
    order: Order!
    method: PaymentMethod!
    status: PaymentStatus!
    amount: Decimal!
    currency: String!
    paidAt: DateTime
    createdAt: DateTime!
  }

  type Refund {
    id: ID!
    order: Order!
    amount: Decimal!
    isPartial: Boolean!
    reason: String
    status: PaymentStatus!
    createdAt: DateTime!
  }

  type PromoCode {
    id: ID!
    code: String!
    description: String
    type: CouponType!
    value: Decimal!
    minOrderAmount: Decimal!
    maxDiscount: Decimal
    usageLimit: Int
    usedCount: Int!
    restaurant: Restaurant
    isActive: Boolean!
    startsAt: DateTime!
    expiresAt: DateTime!
  }

  type LoyaltyTransaction {
    id: ID!
    type: TransactionType!
    points: Int!
    balanceAfter: Int!
    note: String
    order: Order
    createdAt: DateTime!
  }

  type PayoutResult { id: ID!, status: PayoutStatus!, amount: Decimal! }

  input PromoCodeInput {
    code: String!
    description: String
    type: CouponType!
    value: Decimal!
    minOrderAmount: Decimal
    maxDiscount: Decimal
    usageLimit: Int
    usagePerUser: Int
    restaurantId: ID
    startsAt: DateTime!
    expiresAt: DateTime!
  }

  extend type Query {
    myWallet: Wallet
    walletForUser(userId: ID!): Wallet # admin
    activePromos(restaurantId: ID): [PromoCode!]!
    myPromoHistory: [PromoCode!]!
    loyaltyHistory(page: Int, limit: Int): [LoyaltyTransaction!]!
    payments(status: PaymentStatus, method: PaymentMethod, from: DateTime, to: DateTime, page: Int, limit: Int): PaymentPage! # admin
  }

  type PaymentPage { items: [Payment!]!, total: Int!, page: Int!, pages: Int! }

  extend type Mutation {
    # card checkout returns a clientSecret to confirm with Stripe on the client
    createCardPayment(orderId: ID!): JSONObject!
    topUpWallet(amount: Decimal!): JSONObject! # card topup -> clientSecret
    confirmTopup(intentId: String!): Wallet!

    applyPromo(orderDraft: JSONObject!): JSONObject! # validate a code against a cart preview
    togglePromo(id: ID!, isActive: Boolean!): PromoCode!
    createPromo(input: PromoCodeInput!): PromoCode!
    updatePromo(id: ID!, input: PromoCodeInput!): PromoCode!
    deletePromo(id: ID!): Boolean!

    redeemLoyalty(points: Int!): JSONObject! # convert points to wallet credit

    # payouts
    requestDriverPayout(amount: Decimal!, accountInfo: String): PayoutResult!
    requestRestaurantPayout(restaurantId: ID!, periodFrom: DateTime!, periodTo: DateTime!): PayoutResult!
    adminProcessPayout(id: ID!, approve: Boolean!, isDriver: Boolean!): PayoutResult!

    # refunds (support/admin)
    processRefund(orderId: ID!, amount: Decimal, partial: Boolean, reason: String): Refund!
    adminCreditWallet(userId: ID!, amount: Decimal!, note: String): Wallet!
  }
`;
