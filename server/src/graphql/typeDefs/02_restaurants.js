const { gql } = require('graphql-tag');

/** Cuisines, restaurants, branches, operating hours, menus & combos. */

module.exports = gql`
  type Cuisine {
    id: ID!
    name: String!
    slug: String!
    iconUrl: String
    isActive: Boolean!
    sortOrder: Int!
    restaurantCount: Int
  }

  type Restaurant {
    id: ID!
    owner: User!
    name: String!
    slug: String!
    description: String
    logoUrl: String
    coverUrl: String
    phone: String
    email: String
    status: RestaurantStatus!
    rejectionReason: String
    isFeatured: Boolean!
    commissionRate: Decimal
    licenseDocUrl: String
    foodSafetyUrl: String
    avgRating: Float!
    reviewCount: Int!
    totalOrders: Int!
    cuisines: [Cuisine!]!
    branches: [Branch!]!
    reviews(limit: Int, page: Int): ReviewPage!
    createdAt: DateTime!
    # computed for the browse list, given a lat/lng context:
    distanceKm: Decimal
    minDeliveryTimeMin: Int
  }

  type Branch {
    id: ID!
    restaurant: Restaurant!
    name: String!
    phone: String
    addressLine1: String!
    city: String!
    country: String!
    postalCode: String
    lat: Decimal!
    lng: Decimal!
    status: BranchStatus!
    isOpenNow: Boolean!
    deliveryRadiusKm: Decimal!
    minOrderAmount: Decimal!
    deliveryFee: Decimal!
    freeDeliveryAbove: Decimal
    prepTimeMinutes: Int!
    serviceFeePercent: Decimal!
    hours: [OperatingHour!]!
    categories: [MenuCategory!]!
    combos: [Combo!]!
  }

  type OperatingHour {
    id: ID!
    dayOfWeek: Int!
    openTime: String!
    closeTime: String!
    isClosed: Boolean!
  }

  type MenuCategory {
    id: ID!
    branchId: ID!
    name: String!
    sortOrder: Int!
    isActive: Boolean!
    slot: MenuSlot!
    items(availability: ItemAvailability): [MenuItem!]!
  }

  type MenuItem {
    id: ID!
    branch: Branch!
    category: MenuCategory!
    name: String!
    description: String
    price: Decimal!
    compareAtPrice: Decimal
    offerValidFrom: DateTime
    offerValidTo: DateTime
    imageUrls: [String!]!
    prepTimeMinutes: Int!
    availability: ItemAvailability!
    isBestSeller: Boolean!
    isVegan: Boolean!
    isVegetarian: Boolean!
    isSpicy: Boolean!
    isGlutenFree: Boolean!
    isNew: Boolean!
    calories: Int
    sortOrder: Int!
    slot: MenuSlot!
    variants: [ItemVariant!]!
    addOns: [ItemAddOn!]!
    restaurantName: String
    tags: [String!]!
  }

  type ItemVariant {
    id: ID!
    name: String!
    optionType: String!
    sortOrder: Int!
    options: [ItemVariantOption!]!
  }

  type ItemVariantOption {
    id: ID!
    label: String!
    priceModifier: Decimal!
    isDefault: Boolean!
  }

  type ItemAddOn {
    id: ID!
    name: String!
    price: Decimal!
    isRequired: Boolean!
  }

  type Combo {
    id: ID!
    name: String!
    description: String
    comboPrice: Decimal!
    imageUrls: [String!]!
    isActive: Boolean!
    items: [ComboItem!]!
  }

  type ComboItem {
    id: ID!
    item: MenuItem!
    quantity: Int!
  }

  input RestaurantProfileInput {
    name: String
    description: String
    logoUrl: String
    coverUrl: String
    phone: String
    email: String
    cuisineIds: [ID!]
    commissionRate: Decimal
  }

  input BranchInput {
    name: String
    phone: String
    addressLine1: String!
    city: String!
    country: String!
    postalCode: String
    lat: Decimal!
    lng: Decimal!
    deliveryRadiusKm: Decimal
    minOrderAmount: Decimal
    deliveryFee: Decimal
    freeDeliveryAbove: Decimal
    prepTimeMinutes: Int
    serviceFeePercent: Decimal
  }

  input OperatingHoursInput {
    dayOfWeek: Int!
    openTime: String!
    closeTime: String!
    isClosed: Boolean
  }

  input MenuCategoryInput {
    name: String!
    sortOrder: Int
    slot: MenuSlot
    isActive: Boolean
  }

  input VariantOptionInput { label: String!, priceModifier: Decimal, isDefault: Boolean }
  input ItemVariantInput { name: String!, optionType: String, sortOrder: Int, options: [VariantOptionInput!]! }
  input AddOnInput { name: String!, price: Decimal!, isRequired: Boolean }

  input MenuItemInput {
    categoryId: ID!
    name: String!
    description: String
    price: Decimal!
    compareAtPrice: Decimal
    offerValidFrom: DateTime
    offerValidTo: DateTime
    imageUrls: [String!]
    prepTimeMinutes: Int
    isBestSeller: Boolean
    isVegan: Boolean
    isVegetarian: Boolean
    isSpicy: Boolean
    isGlutenFree: Boolean
    isNew: Boolean
    calories: Int
    sortOrder: Int
    slot: MenuSlot
    variants: [ItemVariantInput!]
    addOns: [AddOnInput!]
  }

  input ComboInput {
    name: String!
    description: String
    comboPrice: Decimal!
    imageUrls: [String!]
    itemIds: [ID!]!
  }

  type RestaurantPage { items: [Restaurant!]!, total: Int!, page: Int!, pages: Int! }
  type MenuItemPage { items: [MenuItem!]!, total: Int!, page: Int!, pages: Int! }

  input RestaurantBrowseFilters {
    search: String
    cuisineId: ID
    minRating: Float
    maxDeliveryTimeMin: Int
    maxMinOrder: Decimal
    priceRange: Int # 1..4
    dietary: [String!]
    lat: Decimal
    lng: Decimal
    near: Boolean # "near me" by delivery radius from lat/lng
    featured: Boolean
    openNow: Boolean
    sort: String # relevance|rating|delivery_time|distance|popularity
    page: Int
    limit: Int
  }

  extend type Query {
    cuisines: [Cuisine!]!
    restaurants(filters: RestaurantBrowseFilters): RestaurantPage!
    restaurant(id: ID!): Restaurant
    restaurantBySlug(slug: String!): Restaurant
    branchesForRestaurant(restaurantId: ID!): [Branch!]!
    branch(id: ID!): Branch
    branchMenu(branchId: ID!, slot: MenuSlot): [MenuCategory!]!
    searchFood(query: String!, page: Int, limit: Int): MenuItemPage!
    trendingRestaurants(limit: Int): [Restaurant!]!
    trendingDishes(limit: Int): [MenuItem!]!
    recommendedForMe(limit: Int): [Restaurant!]! # AI (OpenRouter) + history
  }

  extend type Mutation {
    # restaurant owner
    updateRestaurantProfile(id: ID!, input: RestaurantProfileInput!): Restaurant!
    submitRestaurantForApproval(input: RestaurantProfileInput!, docs: JSONObject): Restaurant!
    addBranch(restaurantId: ID!, input: BranchInput!): Branch!
    updateBranch(id: ID!, input: BranchInput!): Branch!
    setBranchStatus(id: ID!, status: BranchStatus!): Branch!
    setBranchHours(branchId: ID!, hours: [OperatingHoursInput!]!): Branch!
    addBranchStaff(branchId: ID!, email: String!): User!

    # menu management
    createMenuCategory(branchId: ID!, input: MenuCategoryInput!): MenuCategory!
    updateMenuCategory(id: ID!, input: MenuCategoryInput!): MenuCategory!
    deleteMenuCategory(id: ID!): Boolean!
    reorderMenuCategories(branchId: ID!, orderedIds: [ID!]!): [MenuCategory!]!

    createMenuItem(branchId: ID!, input: MenuItemInput!): MenuItem!
    updateMenuItem(id: ID!, input: JSONObject!): MenuItem! # partial field update
    deleteMenuItem(id: ID!): Boolean!
    setMenuItemAvailability(id: ID!, availability: ItemAvailability!): MenuItem!
    bulkSetMenuAvailability(ids: [ID!]!, availability: ItemAvailability!): Int!
    bulkCreateMenuItems(branchId: ID!, items: [MenuItemInput!]!): Int!

    createCombo(branchId: ID!, input: ComboInput!): Combo!
    deleteCombo(id: ID!): Boolean!

    generateItemDescription(name: String!, notes: String): String! # AI

    # admin
    adminSetRestaurantStatus(id: ID!, status: RestaurantStatus!, reason: String): Restaurant!
    adminFeatureRestaurant(id: ID!, featured: Boolean!, until: DateTime): Restaurant!
    adminSetCommission(id: ID!, percent: Decimal): Restaurant!
    adminCreateCuisine(name: String!, iconUrl: String): Cuisine!
    adminUpdateCuisine(id: ID!, name: String, iconUrl: String, isActive: Boolean, sortOrder: Int): Cuisine!
  }
`;
