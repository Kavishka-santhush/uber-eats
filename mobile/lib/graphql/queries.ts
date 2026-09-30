import { gql } from '@apollo/client';

/**
 * GraphQL documents for the mobile app. Field selections mirror the server
 * typeDefs exactly (same contracts as the web client), so screens can share
 * expectations about Decimal-as-string scalars and paginated shapes.
 */

/* ------------------------------- fragments ------------------------------- */

export const USER_CORE = gql`
  fragment UserCore on User {
    id
    fullName
    email
    phone
    role
    avatarUrl
    status
    locale
    darkMode
  }
`;

export const RESTAURANT_CARD = gql`
  fragment RestaurantCard on Restaurant {
    id
    name
    slug
    logoUrl
    coverUrl
    avgRating
    reviewCount
    isFeatured
    distanceKm
    minDeliveryTimeMin
    cuisines { id name }
    branches {
      id
      name
      isOpenNow
      deliveryFee
      minOrderAmount
      prepTimeMinutes
      deliveryRadiusKm
    }
  }
`;

export const MENU_ITEM = gql`
  fragment MenuItemFragment on MenuItem {
    id
    name
    description
    price
    compareAtPrice
    imageUrls
    availability
    isBestSeller
    isNew
    prepTimeMinutes
    tags
    variants {
      id
      name
      optionType
      options { id label priceModifier isDefault }
    }
    addOns { id name price isRequired }
  }
`;

export const ORDER_CARD = gql`
  fragment OrderCard on Order {
    id
    orderNumber
    status
    paymentStatus
    paymentMethod
    total
    itemsTotal
    deliveryFee
    serviceFee
    discountTotal
    estimatedDeliveryAt
    createdAt
    deliveredAt
    branch { id name lat lng restaurant { id name logoUrl } }
    items { id nameSnapshot quantity priceSnapshot lineTotal }
    delivery {
      id
      status
      etaMinutes
      driver { userId avgRating user { id fullName avatarUrl } vehicleType vehiclePlate }
    }
  }
`;

/* --------------------------- customer / browse --------------------------- */

export const CUISINES = gql`
  query Cuisines {
    cuisines { id name slug iconUrl isActive }
  }
`;

export const RESTAURANTS = gql`
  query Restaurants($filters: RestaurantBrowseFilters) {
    restaurants(filters: $filters) {
      items { ...RestaurantCard }
      total
      page
      pages
    }
  }
  ${RESTAURANT_CARD}
`;

export const RESTAURANT_BY_SLUG = gql`
  query RestaurantBySlug($slug: String!) {
    restaurantBySlug(slug: $slug) {
      id
      name
      slug
      description
      logoUrl
      coverUrl
      avgRating
      reviewCount
      totalOrders
      cuisines { id name }
      branches {
        id
        name
        isOpenNow
        status
        addressLine1
        city
        lat
        lng
        deliveryFee
        minOrderAmount
        freeDeliveryAbove
        prepTimeMinutes
        deliveryRadiusKm
        serviceFeePercent
        hours { id dayOfWeek openTime closeTime isClosed }
      }
    }
  }
`;

export const BRANCH_MENU = gql`
  query BranchMenu($branchId: ID!, $slot: MenuSlot) {
    branchMenu(branchId: $branchId, slot: $slot) {
      id
      name
      sortOrder
      slot
      items { ...MenuItemFragment }
    }
  }
  ${MENU_ITEM}
`;

export const SEARCH_FOOD = gql`
  query SearchFood($query: String!, $page: Int, $limit: Int) {
    searchFood(query: $query, page: $page, limit: $limit) {
      items {
        id
        name
        price
        imageUrls
        restaurantName
        branch { id name restaurant { id slug } }
      }
      total
      page
      pages
    }
  }
`;

export const TRENDING_RESTAURANTS = gql`
  query TrendingRestaurants($limit: Int) {
    trendingRestaurants(limit: $limit) { ...RestaurantCard }
  }
  ${RESTAURANT_CARD}
`;

export const RECOMMENDED = gql`
  query Recommended($limit: Int) {
    recommendedForMe(limit: $limit) { ...RestaurantCard }
  }
  ${RESTAURANT_CARD}
`;

export const DELIVERY_QUOTE = gql`
  query DeliveryQuote($branchId: ID!, $addressId: ID!, $itemsTotal: Decimal!) {
    deliveryQuote(branchId: $branchId, addressId: $addressId, itemsTotal: $itemsTotal)
  }
`;

/** Server-side Google geocoding — turns a typed street address into coords. */
export const GEOCODE = gql`
  query Geocode($address: String!) {
    geocode(address: $address) { lat lng formattedAddress placeId }
  }
`;

/* ------------------------------- profile -------------------------------- */

export const ME_FULL = gql`
  query MeFull {
    me {
      ...UserCore
      addresses { id label fullName phone line1 line2 city state country postalCode lat lng isDefault }
      wallet { id balance currency }
      favorites { id restaurant { ...RestaurantCard } item { id name price imageUrls } }
      unreadNotificationCount
      loyaltyPoints
      ownedRestaurants {
        id name status avgRating totalOrders commissionRate
        branches { id name status addressLine1 city minOrderAmount }
      }
      driverProfile { userId availability approvalStatus isSuspended earningsBalance }
      notificationPref { pushOrders pushPromos emailOrders emailPromos smsCritical }
    }
  }
  ${USER_CORE}
  ${RESTAURANT_CARD}
`;

export const MY_FAVS = gql`
  query MyFavs {
    me {
      id
      favorites {
        id
        restaurant { ...RestaurantCard }
        item {
          id
          name
          price
          imageUrls
          availability
          branch { id name isOpenNow deliveryFee minOrderAmount restaurant { id name slug } }
        }
      }
    }
  }
  ${RESTAURANT_CARD}
`;

/* -------------------------------- orders -------------------------------- */

export const MY_ORDERS = gql`
  query MyOrders($page: Int, $limit: Int) {
    myOrders(page: $page, limit: $limit) {
      items { ...OrderCard }
      total
      page
      pages
    }
  }
  ${ORDER_CARD}
`;

export const ACTIVE_ORDER = gql`
  query ActiveOrder {
    activeOrder { ...OrderCard }
  }
  ${ORDER_CARD}
`;

export const ORDER_DETAIL = gql`
  query OrderDetail($id: ID!) {
    order(id: $id) {
      ...OrderCard
      address { id label line1 line2 city lat lng }
      specialInstructions
      cancelReason
      restaurantRating
      driverRating
      promoCode { id code type value }
      statusLogs { id status note createdAt }
      delivery {
        id
        status
        etaMinutes
        routePolyline
        pickupLat
        pickupLng
        dropoffLat
        dropoffLng
        driver { userId avgRating user { id fullName phone avatarUrl } vehicleType vehicleModel vehiclePlate }
        liveLocations { id lat lng heading speed recordedAt }
      }
    }
  }
  ${ORDER_CARD}
`;

export const ORDER_CHAT = gql`
  query OrderChat($orderId: ID!) {
    orderChat(orderId: $orderId) { id orderId body createdAt sender { id fullName avatarUrl } }
  }
`;

/* ---------------------- wallet / promos / notifications ------------------- */

export const MY_WALLET = gql`
  query MyWallet($page: Int, $limit: Int) {
    myWallet {
      id
      balance
      currency
      transactions(page: $page, limit: $limit) {
        items { id type amount balanceAfter note createdAt }
        total
        page
        pages
      }
    }
  }
`;

export const ACTIVE_PROMOS = gql`
  query ActivePromos($restaurantId: ID) {
    activePromos(restaurantId: $restaurantId) {
      id
      code
      description
      type
      value
      minOrderAmount
      maxDiscount
      usedCount
      usageLimit
      expiresAt
      restaurant { id name slug }
    }
  }
`;

export const LOYALTY_HISTORY = gql`
  query LoyaltyHistory($page: Int, $limit: Int) {
    loyaltyHistory(page: $page, limit: $limit) { id type points balanceAfter note createdAt }
  }
`;

export const NOTIFICATIONS = gql`
  query Notifications($onlyUnread: Boolean, $page: Int, $limit: Int) {
    notifications(onlyUnread: $onlyUnread, page: $page, limit: $limit) {
      items { id title body channel category data isRead createdAt }
      total
      page
      pages
      unread
    }
  }
`;

/* -------------------------------- reviews -------------------------------- */

export const RESTAURANT_REVIEWS = gql`
  query RestaurantReviews($restaurantId: ID!, $page: Int, $limit: Int) {
    restaurantReviews(restaurantId: $restaurantId, page: $page, limit: $limit) {
      items {
        id rating comment photoUrls createdAt
        author { id fullName avatarUrl }
        response { id message createdAt }
        helpfulCount
      }
      total
      page
      pages
    }
  }
`;

export const PENDING_REVIEW = gql`
  query PendingReview($orderId: ID!) {
    pendingReviewForOrder(orderId: $orderId) { orderRated driverRated hasDriver }
  }
`;

/* ------------------------------ driver app ------------------------------- */

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

/* ------------------------- restaurant back office ------------------------- */

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

/* -------------------------------- support -------------------------------- */

export const MY_TICKETS = gql`
  query MyTickets($page: Int, $limit: Int) {
    myTickets(page: $page, limit: $limit) {
      items { id number subject category priority status createdAt resolution }
      total
      page
      pages
    }
  }
`;

export const TICKET_DETAIL = gql`
  query TicketDetail($id: ID!) {
    ticket(id: $id) {
      id number subject description category priority status resolution refundAmount walletCredit createdAt
      creator { id fullName email phone }
      assignedTo { id fullName }
      order { id orderNumber total status branch { id name restaurant { id name } } }
      messages { id body isStaff createdAt author { id fullName avatarUrl } }
    }
  }
`;
