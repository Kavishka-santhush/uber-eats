const { gql } = require('graphql-tag');

/** Orders, order items, delivery tracking, chat, group orders. */

module.exports = gql`
  type Order {
    id: ID!
    orderNumber: String!
    customer: User!
    branch: Branch!
    address: Address!
    status: OrderStatus!
    items: [OrderItem!]!
    itemsTotal: Decimal!
    deliveryFee: Decimal!
    serviceFee: Decimal!
    discountTotal: Decimal!
    taxTotal: Decimal!
    total: Decimal!
    surgeMultiplier: Decimal!
    paymentMethod: PaymentMethod!
    paymentStatus: PaymentStatus!
    promoCode: PromoCode
    loyaltyPointsUsed: Int!
    loyaltyPointsEarned: Int!
    specialInstructions: String
    estimatedDeliveryAt: DateTime
    scheduledFor: DateTime
    confirmedAt: DateTime
    pickedUpAt: DateTime
    deliveredAt: DateTime
    cancelledAt: DateTime
    cancelReason: String
    restaurantRating: Int
    driverRating: Int
    distanceKm: Decimal
    dropoffLat: Decimal
    dropoffLng: Decimal
    proofPhotoUrl: String
    delivery: Delivery
    statusLogs: [OrderStatusLog!]!
    groupOrder: GroupOrder
    createdAt: DateTime!
  }

  type OrderItem {
    id: ID!
    item: MenuItem
    nameSnapshot: String!
    priceSnapshot: Decimal!
    quantity: Int!
    addOnsTotal: Decimal!
    variantTotal: Decimal!
    lineTotal: Decimal!
    specialInstructions: String
    variantOption: ItemVariantOption
    addOn: ItemAddOn
  }

  type OrderStatusLog {
    id: ID!
    status: OrderStatus!
    note: String
    changedBy: String
    createdAt: DateTime!
  }

  type Delivery {
    id: ID!
    order: Order!
    driver: DriverProfile
    status: OrderStatus!
    pickupLat: Decimal!
    pickupLng: Decimal!
    dropoffLat: Decimal!
    dropoffLng: Decimal!
    distanceKm: Decimal
    durationMin: Int
    baseFee: Decimal!
    distanceBonus: Decimal!
    driverEarning: Decimal!
    surgeMultiplier: Decimal!
    assignedAt: DateTime
    pickedUpAt: DateTime
    deliveredAt: DateTime
    proofPhotoUrl: String
    routePolyline: String # Google Directions overview polyline (computed)
    liveLocations: [DriverLocation!]!
    etaMinutes: Int
  }

  type DriverLocation {
    id: ID!
    lat: Decimal!
    lng: Decimal!
    heading: Float
    speed: Float
    recordedAt: DateTime!
  }

  type GroupOrder {
    id: ID!
    code: String!
    host: User!
    branch: Branch!
    isActive: Boolean!
    orders: [Order!]!
    createdAt: DateTime!
  }

  type ChatMessage {
    id: ID!
    orderId: ID!
    sender: User!
    body: String!
    createdAt: DateTime!
  }

  type OrderPage { items: [Order!]!, total: Int!, page: Int!, pages: Int! }

  input CartLineInput {
    menuItemId: ID!
    quantity: Int!
    variantOptionId: ID
    addOnId: ID
    specialInstructions: String
  }

  input PlaceOrderInput {
    branchId: ID!
    addressId: ID!
    items: [CartLineInput!]!
    paymentMethod: PaymentMethod!
    promoCode: String
    loyaltyPointsToUse: Int
    specialInstructions: String
    scheduledFor: DateTime
    groupOrderId: ID
  }

  input DeliveryLocationInput {
    lat: Decimal!
    lng: Decimal!
    heading: Float
    speed: Float
  }

  extend type Query {
    orders(status: OrderStatus, search: String, branchId: ID, customerId: ID, driverId: ID, from: DateTime, to: DateTime, page: Int, limit: Int): OrderPage! # role-scoped
    order(id: ID!): Order
    orderByNumber(orderNumber: String!): Order
    myOrders(page: Int, limit: Int): OrderPage!
    activeOrder: Order # newest non-terminal order for customer
    branchOrders(branchId: ID!, status: OrderStatus, page: Int, limit: Int): OrderPage! # owner/staff
    driverActiveDelivery: Delivery
    orderChat(orderId: ID!): [ChatMessage!]!
    groupOrder(code: String!): GroupOrder
    deliveryQuote(branchId: ID!, addressId: ID!, itemsTotal: Decimal!): JSONObject! # fee/eta/surge preview
  }

  extend type Mutation {
    placeOrder(input: PlaceOrderInput!): Order!
    cancelOrder(id: ID!, reason: String): Order!
    reorder(orderId: ID!): Order!

    # restaurant actions
    acceptOrder(id: ID!, prepMinutes: Int): Order!
    rejectOrder(id: ID!, reason: String!): Order!
    setOrderPreparing(id: ID!): Order!
    markOrderReady(id: ID!): Order!

    # driver actions
    updateDeliveryStatus(deliveryId: ID!, status: OrderStatus!, proofPhotoUrl: String): Delivery!
    markPickedUp(deliveryId: ID!): Delivery!
    markDelivered(deliveryId: ID!, proofPhotoUrl: String): Delivery!
    sendDeliveryLocation(deliveryId: ID!, location: DeliveryLocationInput!): Boolean # REST/socket primary; GraphQL fallback

    # group ordering
    createGroupOrder(branchId: ID!): GroupOrder!
    joinGroupOrder(code: String!): GroupOrder!
    closeGroupOrder(id: ID!): GroupOrder!

    # chat
    sendOrderMessage(orderId: ID!, body: String!): ChatMessage!
  }
`;
