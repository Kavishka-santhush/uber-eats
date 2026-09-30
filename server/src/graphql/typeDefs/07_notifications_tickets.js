const { gql } = require('graphql-tag');

/** Notifications, favorites, support tickets, chatbot (AI). */

module.exports = gql`
  type Notification {
    id: ID!
    title: String!
    body: String!
    channel: String!
    category: String!
    data: JSONObject
    isRead: Boolean!
    createdAt: DateTime!
  }

  type NotificationPage { items: [Notification!]!, total: Int!, page: Int!, pages: Int!, unread: Int! }

  type FavoriteResult { id: ID!, restaurant: Restaurant, item: MenuItem }

  type Ticket {
    id: ID!
    number: String!
    creator: User!
    subject: String!
    description: String!
    category: TicketCategory!
    aiCategory: String
    priority: Int!
    status: TicketStatus!
    order: Order
    assignedTo: User
    resolution: String
    refundAmount: Decimal
    walletCredit: Decimal
    messages: [TicketMessage!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type TicketMessage {
    id: ID!
    author: User!
    body: String!
    isStaff: Boolean!
    createdAt: DateTime!
  }

  type TicketPage { items: [Ticket!]!, total: Int!, page: Int!, pages: Int! }

  input RaiseTicketInput {
    subject: String!
    description: String!
    orderId: ID
    category: TicketCategory
  }

  input ResolveTicketInput {
    ticketId: ID!
    status: TicketStatus!
    resolution: String
    refundAmount: Decimal
    walletCredit: Decimal
  }

  extend type Query {
    notifications(onlyUnread: Boolean, page: Int, limit: Int): NotificationPage!
    unreadCount: Int!
    myTickets(page: Int, limit: Int): TicketPage!
    tickets(status: TicketStatus, assignedToMe: Boolean, search: String, page: Int, limit: Int): TicketPage! # staff queue
    ticket(id: ID!): Ticket
    chatbotSuggest(orderId: ID!): [String!]! # AI quick-reply suggestions
  }

  extend type Mutation {
    markNotificationRead(id: ID!): Boolean!
    markAllNotificationsRead: Boolean!
    deleteNotification(id: ID!): Boolean!

    toggleFavoriteRestaurant(restaurantId: ID!): FavoriteResult!
    toggleFavoriteItem(menuItemId: ID!): FavoriteResult!

    raiseTicket(input: RaiseTicketInput!): Ticket!
    replyTicket(ticketId: ID!, body: String!): TicketMessage!
    resolveTicket(input: ResolveTicketInput!): Ticket!
    assignTicket(ticketId: ID!, agentId: ID!): Ticket!

    askChatbot(orderId: ID!, message: String!): String! # AI support bot
  }
`;
