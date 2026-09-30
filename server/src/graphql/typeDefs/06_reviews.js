const { gql } = require('graphql-tag');

/** Ratings & reviews for restaurants, drivers and dishes. */

module.exports = gql`
  type Review {
    id: ID!
    author: User!
    restaurant: Restaurant
    branch: Branch
    order: Order
    item: MenuItem
    driver: DriverProfile
    type: String!
    rating: Int!
    comment: String
    photoUrls: [String!]!
    helpfulCount: Int!
    isAbusiveFlagged: Boolean!
    response: ReviewResponse
    hasVoted: Boolean
    createdAt: DateTime!
  }

  type ReviewResponse {
    id: ID!
    user: User!
    message: String!
    createdAt: DateTime!
  }

  type ReviewReport {
    id: ID!
    review: Review!
    reporter: User!
    reason: String!
    status: String!
    createdAt: DateTime!
  }

  type ReviewPage { items: [Review!]!, total: Int!, page: Int!, pages: Int! }

  input CreateReviewInput {
    orderId: ID!
    restaurantId: ID!
    branchId: ID
    menuItemId: ID
    driverUserId: ID
    type: String! # restaurant | driver | dish
    rating: Int!
    comment: String
    photoUrls: [String!]
  }

  extend type Query {
    restaurantReviews(restaurantId: ID!, minRating: Int, page: Int, limit: Int): ReviewPage!
    driverReviews(driverUserId: ID!, page: Int, limit: Int): ReviewPage!
    itemReviews(menuItemId: ID!, page: Int, limit: Int): ReviewPage!
    review(id: ID!): Review
    pendingReviewForOrder(orderId: ID!): JSONObject # whether customer still owes ratings
  }

  extend type Mutation {
    createReview(input: CreateReviewInput!): Review!
    respondToReview(reviewId: ID!, message: String!): ReviewResponse!
    voteReview(reviewId: ID!, helpful: Boolean!): Review!
    reportReview(reviewId: ID!, reason: String!): ReviewReport!
    deleteReview(id: ID!): Boolean!
    adminResolveReviewReport(reportId: ID!, action: String!): ReviewReport! # remove|keep
  }
`;
