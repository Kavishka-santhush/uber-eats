const { gql } = require('graphql-tag');

/** Platform admin: dashboards, analytics, settings, surge zones, audit. */

module.exports = gql`
  type PlatformStats {
    activeOrders: Int!
    onlineDrivers: Int!
    activeRestaurants: Int!
    revenueToday: Decimal!
    ordersToday: Int!
    newSignupsToday: Int!
    revenueTotal: Decimal!
    payoutsPendingAmount: Decimal!
  }

  type ChartPoint { label: String!, value: Decimal! }

  type AdminDashboard {
    stats: PlatformStats!
    revenueSeries: [ChartPoint!]!
    ordersSeries: [ChartPoint!]!
    topRestaurants: [Restaurant!]!
    topDrivers: [DriverProfile!]!
    recentOrders: [Order!]!
    pendingRestaurantApps: Int!
    pendingDriverApps: Int!
    openTickets: Int!
  }

  type AnalyticsReport {
    revenue: [ChartPoint!]!
    ordersByStatus: [ChartPoint!]!
    ordersByHour: [ChartPoint!]!
    topCuisines: [ChartPoint!]!
    restaurantRevenue: [ChartPoint!]!
    driverThroughput: [ChartPoint!]!
    customerGrowth: [ChartPoint!]!
  }

  type SurgeZone {
    id: ID!
    name: String!
    branch: Branch
    centerLat: Decimal!
    centerLng: Decimal!
    radiusKm: Decimal!
    polygon: JSONObject
    multiplier: Decimal!
    isActive: Boolean!
    scheduleFrom: DateTime
    scheduleTo: DateTime
    daysOfWeek: [Int!]!
  }

  type PlatformSettingNode { key: String!, value: JSONObject!, updatedAt: DateTime! }
  type AuditLogEntry { id: ID!, user: User, action: String!, entity: String, entityId: String, ip: String, meta: JSONObject, createdAt: DateTime! }
  type AuditLogPage { items: [AuditLogEntry!]!, total: Int!, page: Int!, pages: Int! }

  input SurgeZoneInput {
    name: String!
    branchId: ID
    centerLat: Decimal!
    centerLng: Decimal!
    radiusKm: Decimal!
    polygon: JSONObject
    multiplier: Decimal!
    isActive: Boolean
    scheduleFrom: DateTime
    scheduleTo: DateTime
    daysOfWeek: [Int!]
  }

  extend type Query {
    adminDashboard: AdminDashboard!
    platformStats: PlatformStats!
    analytics(from: DateTime, to: DateTime, granularity: String): AnalyticsReport!
    surgeZones(activeOnly: Boolean): [SurgeZone!]!
    activeDeliveries: [Delivery!]! # ops live map
    platformSettings: [PlatformSettingNode!]! # super admin
    auditLogs(action: String, userId: ID, page: Int, limit: Int): AuditLogPage!
    restaurantEarnings(restaurantId: ID!, from: DateTime, to: DateTime): JSONObject! # owner dashboard
    adminRestaurants(status: RestaurantStatus, search: String, page: Int, limit: Int): RestaurantPage! # admin/back-office list, any status
    reportCsv(kind: String!, from: DateTime, to: DateTime): String! # returns download URL
    demandPrediction(branchId: ID!): JSONObject! # AI
  }

  extend type Mutation {
    adminUpsertSetting(key: String!, value: JSONObject!): PlatformSettingNode!
    adminSetCommissionRate(percent: Decimal!): Boolean!
    adminSetLoyaltyRates(earnRate: Int!, redeemRate: Int!): Boolean!

    upsertSurgeZone(id: ID, input: SurgeZoneInput!): SurgeZone!
    toggleSurgeZone(id: ID!, active: Boolean!): SurgeZone!
    deleteSurgeZone(id: ID!): Boolean!

    adminSuspendRestaurant(id: ID!, suspended: Boolean!): Restaurant!
    adminInterveneOrder(id: ID!, action: String!, note: String): Order! # force_cancel|reassign|refund
    publishAnnouncement(title: String!, body: String!): Boolean!
    generateInvoice(orderId: ID!): String! # returns PDF/HTML url
    generateRestaurantStatement(restaurantId: ID!, periodFrom: DateTime!, periodTo: DateTime!): String!

    adminAddStaffUser(role: Role!, fullName: String!, email: String!, password: String!): User!
  }
`;
