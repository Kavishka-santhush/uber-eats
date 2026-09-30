import { gql } from '@apollo/client';
import { ORDER_CARD, RESTAURANT_CARD } from './queries';

/** Restaurant back-office: role-scoped orders + earnings. */
export const BRANCH_ORDERS = gql`
  query BranchOrders($branchId: ID!, $status: OrderStatus, $page: Int, $limit: Int) {
    branchOrders(branchId: $branchId, status: $status, page: $page, limit: $limit) {
      items {
        ...OrderCard
        address { id label line1 }
        customer { id fullName phone }
        specialInstructions
      }
      total
      page
      pages
    }
  }
  ${ORDER_CARD}
`;

export const MY_RESTAURANT_EARNINGS = gql`
  query RestaurantEarnings($restaurantId: ID!, $from: DateTime, $to: DateTime) {
    restaurantEarnings(restaurantId: $restaurantId, from: $from, to: $to)
  }
`;

/** Back-office menu: fuller item/category fields than the public BRANCH_MENU. */
export const MGR_BRANCH_MENU = gql`
  query MgrBranchMenu($branchId: ID!) {
    branchMenu(branchId: $branchId) {
      id
      name
      sortOrder
      slot
      isActive
      items {
        id
        name
        description
        price
        compareAtPrice
        imageUrls
        availability
        prepTimeMinutes
        calories
        slot
        isBestSeller
        isVegan
        isVegetarian
        isSpicy
        isGlutenFree
        isNew
        variants { id name optionType sortOrder options { id label priceModifier isDefault } }
        addOns { id name price isRequired }
      }
    }
  }
`;

export const DEMAND_PREDICTION = gql`
  query DemandPrediction($branchId: ID!) {
    demandPrediction(branchId: $branchId)
  }
`;

/** Driver app. */
export const MY_DRIVER_PROFILE = gql`
  query MyDriverProfile {
    myDriverProfile {
      userId
      availability
      approvalStatus
      isSuspended
      vehicleType
      vehicleModel
      vehiclePlate
      totalDeliveries
      completionRate
      acceptanceRate
      onTimeRate
      avgRating
      reviewCount
      earningsBalance
      lastLat
      lastLng
      user { id fullName phone avatarUrl }
      activeDelivery {
        id
        status
        pickupLat
        pickupLng
        dropoffLat
        dropoffLng
        etaMinutes
        order { id orderNumber total status branch { id name addressLine1 } customer { id fullName phone } address { id line1 } }
      }
    }
  }
`;

export const MY_DELIVERY_REQUESTS = gql`
  query MyDeliveryRequests {
    myDeliveryRequests {
      id
      deliveryId
      status
      expiresAt
      fee
      distanceKm
      order { id orderNumber total branch { id name addressLine1 } address { id line1 city } }
    }
  }
`;

export const DRIVER_EARNINGS = gql`
  query DriverEarnings($from: DateTime, $to: DateTime) {
    driverEarnings(from: $from, to: $to) {
      today
      week
      month
      lifetime
      byDay { date amount }
    }
  }
`;

export const DRIVER_HISTORY = gql`
  query DriverHistory($page: Int, $limit: Int) {
    driverHistory(page: $page, limit: $limit) {
      items { id orderNumber status total deliveredAt branch { id name restaurant { id name } } delivery { id distanceKm driverEarning } }
      total
      page
      pages
    }
  }
`;

/** Ops live map + fleet. */
export const ACTIVE_DELIVERIES = gql`
  query ActiveDeliveries {
    activeDeliveries {
      id
      status
      etaMinutes
      pickupLat
      pickupLng
      dropoffLat
      dropoffLng
      routePolyline
      liveLocations(limit: 1) { lat lng recordedAt }
      order { id orderNumber status total branch { id name } customer { id fullName } }
      driver { userId avgRating lastLat lastLng user { id fullName } }
    }
  }
`;

export const ONLINE_DRIVERS = gql`
  query OnlineDrivers {
    onlineDrivers {
      userId
      availability
      lastLat
      lastLng
      avgRating
      user { id fullName }
    }
  }
`;

export const DRIVER_HEATMAP = gql`
  query DriverHeatmap {
    driverHeatmap
  }
`;

export const DRIVER_PERFORMANCE = gql`
  query DriverPerformance {
    driverPerformance
  }
`;

/** Admin dashboards. */
export const ADMIN_DASHBOARD = gql`
  query AdminDashboard {
    adminDashboard {
      stats { activeOrders onlineDrivers activeRestaurants revenueToday ordersToday newSignupsToday revenueTotal payoutsPendingAmount }
      revenueSeries { label value }
      ordersSeries { label value }
      topRestaurants { ...RestaurantCard }
      topDrivers { userId totalDeliveries avgRating user { id fullName } }
      recentOrders { id orderNumber status total createdAt branch { id name restaurant { id name } } customer { id fullName } }
      pendingRestaurantApps
      pendingDriverApps
      openTickets
    }
  }
  ${RESTAURANT_CARD}
`;

export const ANALYTICS = gql`
  query Analytics($from: DateTime, $to: DateTime) {
    analytics(from: $from, to: $to) {
      revenue { label value }
      ordersByStatus { label value }
      ordersByHour { label value }
      topCuisines { label value }
      restaurantRevenue { label value }
      driverThroughput { label value }
      customerGrowth { label value }
    }
  }
`;

export const PLATFORM_STATS = gql`
  query PlatformStats {
    platformStats { activeOrders onlineDrivers activeRestaurants revenueToday ordersToday newSignupsToday revenueTotal payoutsPendingAmount }
  }
`;

export const SURGE_ZONES = gql`
  query SurgeZones($activeOnly: Boolean) {
    surgeZones(activeOnly: $activeOnly) {
      id name centerLat centerLng radiusKm multiplier isActive daysOfWeek
      branch { id name }
    }
  }
`;

export const PLATFORM_SETTINGS = gql`
  query PlatformSettings {
    platformSettings { key value updatedAt }
  }
`;

export const AUDIT_LOGS = gql`
  query AuditLogs($action: String, $userId: ID, $page: Int, $limit: Int) {
    auditLogs(action: $action, userId: $userId, page: $page, limit: $limit) {
      items { id action entity entityId ip createdAt user { id fullName email } }
      total
      page
      pages
    }
  }
`;

export const ALL_RESTAURANTS = gql`
  query AdminRestaurants($status: RestaurantStatus, $search: String, $page: Int, $limit: Int) {
    adminRestaurants(status: $status, search: $search, page: $page, limit: $limit) {
      items {
        id name slug status isFeatured avgRating totalOrders commissionRate createdAt
        rejectionReason
        owner { id fullName email }
        cuisines { id cuisine { id name } }
        branches { id name city status }
      }
      total
      page
      pages
    }
  }
`;

export const ALL_DRIVERS = gql`
  query AllDrivers($status: RestaurantStatus, $search: String, $page: Int, $limit: Int) {
    drivers(status: $status, search: $search, page: $page, limit: $limit) {
      items {
        userId
        approvalStatus
        isSuspended
        availability
        totalDeliveries
        avgRating
        earningsBalance
        user { id fullName email phone status }
      }
      total
      page
      pages
    }
  }
`;

export const ALL_USERS = gql`
  query AllUsers($role: Role, $status: UserStatus, $search: String, $page: Int, $limit: Int) {
    users(role: $role, status: $status, search: $search, page: $page, limit: $limit) {
      items { id fullName email phone role status createdAt }
      total
      page
      pages
    }
  }
`;

/** Support queue. */
export const TICKETS = gql`
  query Tickets($status: TicketStatus, $assignedToMe: Boolean, $search: String, $page: Int, $limit: Int) {
    tickets(status: $status, assignedToMe: $assignedToMe, search: $search, page: $page, limit: $limit) {
      items {
        id number subject category priority status createdAt
        creator { id fullName email }
        assignedTo { id fullName }
        order { id orderNumber total status }
      }
      total
      page
      pages
    }
  }
`;

export const TICKET_DETAIL = gql`
  query TicketDetail($id: ID!) {
    ticket(id: $id) {
      id number subject description category aiCategory priority status resolution refundAmount walletCredit createdAt
      creator { id fullName email phone }
      assignedTo { id fullName }
      order { id orderNumber total status branch { id name restaurant { id name } } }
      messages { id body isStaff createdAt author { id fullName avatarUrl } }
    }
  }
`;
