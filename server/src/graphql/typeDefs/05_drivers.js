const { gql } = require('graphql-tag');

/** Delivery drivers: profile, availability, requests, earnings, payouts. */

module.exports = gql`
  type DriverProfile {
    userId: ID!
    user: User!
    availability: DriverAvailability!
    vehicleType: VehicleType!
    vehicleModel: String
    vehiclePlate: String
    licenseDocUrl: String
    insuranceDocUrl: String
    photoDocUrl: String
    idDocUrl: String
    approvalStatus: RestaurantStatus!
    rejectionReason: String
    isSuspended: Boolean!
    totalDeliveries: Int!
    completionRate: Float!
    acceptanceRate: Float!
    onTimeRate: Float!
    avgRating: Float!
    reviewCount: Int!
    earningsBalance: Decimal!
    lastLat: Decimal
    lastLng: Decimal
    activeDelivery: Delivery
  }

  type DeliveryRequest {
    id: ID!
    deliveryId: ID!
    status: String!
    expiresAt: DateTime!
    order: Order
    fee: Decimal
    distanceKm: Decimal
  }

  type DriverEarningSummary {
    today: Decimal!
    week: Decimal!
    month: Decimal!
    lifetime: Decimal!
    byDay: [DayAmount!]!
  }

  type DayAmount { date: String!, amount: Decimal! }
  type DriverPage { items: [DriverProfile!]!, total: Int!, page: Int!, pages: Int! }

  extend type Query {
    driverProfile(userId: ID!): DriverProfile
    myDriverProfile: DriverProfile
    myDeliveryRequests: [DeliveryRequest!]!
    driverEarnings(from: DateTime, to: DateTime): DriverEarningSummary!
    driverHistory(page: Int, limit: Int): OrderPage!
    onlineDrivers: [DriverProfile!]! # ops manager
    drivers(status: RestaurantStatus, search: String, page: Int, limit: Int): DriverPage! # admin
    driverPerformance: JSONObject! # admin/ops aggregate stats
    driverHeatmap: JSONObject! # availability density by cell
  }

  extend type Mutation {
    setDriverOnline(online: Boolean!): DriverProfile!
    updateDriverLocation(lat: Decimal!, lng: Decimal!): Boolean
    respondToDelivery(deliveryId: ID!, accept: Boolean!, reason: String): JSONObject!
    updateDriverDocuments(licenseDocUrl: String, insuranceDocUrl: String, photoDocUrl: String, idDocUrl: String, vehicleModel: String, vehiclePlate: String, vehicleType: VehicleType): DriverProfile!
    updateDriverProfile(input: JSONObject!): DriverProfile!

    adminSetDriverApproval(userId: ID!, status: RestaurantStatus!, reason: String): DriverProfile!
    adminSetDriverSuspension(userId: ID!, suspended: Boolean!, reason: String): DriverProfile!
    adminReassignDelivery(deliveryId: ID!, toDriverId: ID): Delivery!
  }
`;
