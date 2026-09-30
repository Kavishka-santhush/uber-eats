const { gql } = require('graphql-tag');

/** Auth, users, addresses, devices, notification preferences. */

module.exports = gql`
  type AuthSession {
    accessToken: String!
    refreshToken: String!
    user: User!
  }

  type User {
    id: ID!
    role: Role!
    email: String
    phone: String
    fullName: String!
    avatarUrl: String
    status: UserStatus!
    isPhoneVerified: Boolean!
    locale: String
    darkMode: Boolean
    createdAt: DateTime!
    wallet: Wallet
    driverProfile: DriverProfile
    ownedRestaurants: [Restaurant!]
    addresses: [Address!]!
    notificationPref: NotificationPreference
    favorites: [Favorite!]!
    unreadNotificationCount: Int!
    loyaltyPoints: Int!
  }

  type Address {
    id: ID!
    label: String!
    fullName: String!
    phone: String
    line1: String!
    line2: String
    city: String!
    state: String
    country: String!
    postalCode: String
    lat: Decimal!
    lng: Decimal!
    notes: String
    isDefault: Boolean!
  }

  input RegisterCustomerInput {
    fullName: String!
    email: String!
    phone: String
    password: String!
  }

  input RegisterRestaurantOwnerInput {
    fullName: String!
    email: String!
    phone: String
    password: String!
    restaurantName: String!
    cuisineIds: [ID!]
    licenseDocUrl: String
    foodSafetyUrl: String
  }

  input RegisterDriverInput {
    fullName: String!
    email: String!
    phone: String!
    password: String!
    vehicleType: VehicleType!
    vehicleModel: String
    vehiclePlate: String
    licenseDocUrl: String!
    insuranceDocUrl: String
    photoDocUrl: String
    idDocUrl: String
  }

  input LoginInput { email: String!, password: String! }
  input GoogleLoginInput { idToken: String! }

  input UpdateProfileInput {
    fullName: String
    phone: String
    avatarUrl: String
    locale: String
    darkMode: Boolean
  }

  input AddressInput {
    label: String
    fullName: String
    phone: String
    line1: String!
    line2: String
    city: String!
    state: String
    country: String!
    postalCode: String
    lat: Decimal!
    lng: Decimal!
    notes: String
    isDefault: Boolean
  }

  input NotificationPreferenceInput {
    pushOrders: Boolean
    pushPromos: Boolean
    emailOrders: Boolean
    emailPromos: Boolean
    smsCritical: Boolean
  }

  type PlacePrediction { description: String!, placeId: String! }
  type GeocodedAddress { lat: Decimal!, lng: Decimal!, formattedAddress: String!, placeId: String }

  extend type Query {
    me: User
    users(role: Role, status: UserStatus, search: String, page: Int, limit: Int): UserPage! # admin
    user(id: ID!): User
    placesAutocomplete(input: String!, lat: Decimal, lng: Decimal): [PlacePrediction!]!
    geocode(address: String!): GeocodedAddress
  }

  extend type Mutation {
    registerCustomer(input: RegisterCustomerInput!): AuthSession!
    registerRestaurantOwner(input: RegisterRestaurantOwnerInput!): AuthSession!
    registerDriver(input: RegisterDriverInput!): AuthSession!
    login(input: LoginInput!): AuthSession!
    loginWithGoogle(input: GoogleLoginInput!): AuthSession!
    logout(refreshToken: String!): Boolean!
    updateProfile(input: UpdateProfileInput!): User!
    changePassword(oldPassword: String!, newPassword: String!): Boolean!

    sendPhoneOtp(phone: String!): Boolean!
    verifyPhoneOtp(code: String!): Boolean!

    addAddress(input: AddressInput!): Address!
    updateAddress(id: ID!, input: AddressInput!): Address!
    deleteAddress(id: ID!): Boolean!
    setDefaultAddress(id: ID!): Address!

    registerDeviceToken(token: String!, platform: String!): Boolean!
    removeDeviceToken(token: String!): Boolean!

    updateNotificationPref(input: NotificationPreferenceInput!): NotificationPreference!
    setDarkMode(dark: Boolean!): User!

    # admin/user management
    adminSetUserStatus(id: ID!, status: UserStatus!): User!
    adminDeleteUser(id: ID!): Boolean!
  }

  type UserPage { items: [User!]!, total: Int!, page: Int!, pages: Int! }

  type NotificationPreference {
    pushOrders: Boolean!
    pushPromos: Boolean!
    emailOrders: Boolean!
    emailPromos: Boolean!
    smsCritical: Boolean!
  }

  type Favorite {
    id: ID!
    restaurant: Restaurant
    item: MenuItem
    createdAt: DateTime!
  }
`;
