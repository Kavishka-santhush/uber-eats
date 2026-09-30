import { gql } from '@apollo/client';

/** Shared fragments reused across queries. */

export const USER_CORE = gql`
  fragment UserCore on User {
    id
    fullName
    email
    phone
    role
    avatarUrl
    status
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

// ---------------------------------------------------------------------------
// Customer / browse
// ---------------------------------------------------------------------------

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

export const RESTAURANT = gql`
  query Restaurant($id: ID!) {
    restaurant(id: $id) {
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
// ---------------------------------------------------------------------------
// Authenticated profile
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Wallet / promos / loyalty / notifications
// ---------------------------------------------------------------------------

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
      id code description type value minOrderAmount maxDiscount expiresAt
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

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

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
