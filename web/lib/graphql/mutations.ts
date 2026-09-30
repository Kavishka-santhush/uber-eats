import { gql } from '@apollo/client';

/** Profile & address */
export const UPDATE_PROFILE = gql`
  mutation UpdateProfile($input: UpdateProfileInput!) {
    updateProfile(input: $input) { id fullName phone avatarUrl locale darkMode }
  }
`;

export const CHANGE_PASSWORD = gql`
  mutation ChangePassword($oldPassword: String!, $newPassword: String!) {
    changePassword(oldPassword: $oldPassword, newPassword: $newPassword)
  }
`;

export const ADD_ADDRESS = gql`
  mutation AddAddress($input: AddressInput!) { addAddress(input: $input) { id label line1 city lat lng isDefault } }
`;
export const UPDATE_ADDRESS = gql`
  mutation UpdateAddress($id: ID!, $input: AddressInput!) { updateAddress(id: $id, input: $input) { id label line1 isDefault } }
`;
export const DELETE_ADDRESS = gql`
  mutation DeleteAddress($id: ID!) { deleteAddress(id: $id) }
`;
export const SET_DEFAULT_ADDRESS = gql`
  mutation SetDefaultAddress($id: ID!) { setDefaultAddress(id: $id) { id isDefault } }
`;
export const UPDATE_NOTIFICATION_PREF = gql`
  mutation UpdateNotificationPref($input: NotificationPreferenceInput!) {
    updateNotificationPref(input: $input) { pushOrders pushPromos emailOrders emailPromos smsCritical }
  }
`;

/** Orders */
export const PLACE_ORDER = gql`
  mutation PlaceOrder($input: PlaceOrderInput!) {
    placeOrder(input: $input) { id orderNumber status paymentStatus total }
  }
`;
export const CANCEL_ORDER = gql`
  mutation CancelOrder($id: ID!, $reason: String) { cancelOrder(id: $id, reason: $reason) { id status cancelReason } }
`;
export const REORDER = gql`
  mutation Reorder($orderId: ID!) { reorder(orderId: $orderId) { id orderNumber status } }
`;
export const SEND_ORDER_MESSAGE = gql`
  mutation SendOrderMessage($orderId: ID!, $body: String!) { sendOrderMessage(orderId: $orderId, body: $body) { id body } }
`;

/** Payments */
export const CREATE_CARD_PAYMENT = gql`
  mutation CreateCardPayment($orderId: ID!) { createCardPayment(orderId: $orderId) }
`;
export const TOPUP_WALLET = gql`
  mutation TopUpWallet($amount: Decimal!) { topUpWallet(amount: $amount) }
`;
export const CONFIRM_TOPUP = gql`
  mutation ConfirmTopup($intentId: String!) { confirmTopup(intentId: $intentId) { id balance currency } }
`;
export const REDEEM_LOYALTY = gql`
  mutation RedeemLoyalty($points: Int!) { redeemLoyalty(points: $points) }
`;

/** Favorites & notifications */
export const TOGGLE_FAV_RESTAURANT = gql`
  mutation ToggleFavRestaurant($restaurantId: ID!) { toggleFavoriteRestaurant(restaurantId: $restaurantId) { id } }
`;
export const TOGGLE_FAV_ITEM = gql`
  mutation ToggleFavItem($menuItemId: ID!) { toggleFavoriteItem(menuItemId: $menuItemId) { id } }
`;
export const MARK_NOTIFICATION_READ = gql`
  mutation MarkNotificationRead($id: ID!) { markNotificationRead(id: $id) }
`;
export const MARK_ALL_NOTIFICATIONS_READ = gql`
  mutation MarkAllRead { markAllNotificationsRead }
`;

/** Reviews */
export const CREATE_REVIEW = gql`
  mutation CreateReview($input: CreateReviewInput!) {
    createReview(input: $input) { id rating comment type }
  }
`;

/** Support tickets */
export const RAISE_TICKET = gql`
  mutation RaiseTicket($input: RaiseTicketInput!) { raiseTicket(input: $input) { id number status } }
`;
export const REPLY_TICKET = gql`
  mutation ReplyTicket($ticketId: ID!, $body: String!) { replyTicket(ticketId: $ticketId, body: $body) { id body } }
`;
export const RESOLVE_TICKET = gql`
  mutation ResolveTicket($input: ResolveTicketInput!) { resolveTicket(input: $input) { id status } }
`;

/** Restaurant back-office */
export const SET_BRANCH_STATUS = gql`
  mutation SetBranchStatus($id: ID!, $status: BranchStatus!) { setBranchStatus(id: $id, status: $status) { id status } }
`;
export const ACCEPT_ORDER = gql`
  mutation AcceptOrder($id: ID!, $prepMinutes: Int) { acceptOrder(id: $id, prepMinutes: $prepMinutes) { id status } }
`;
export const REJECT_ORDER = gql`
  mutation RejectOrder($id: ID!, $reason: String!) { rejectOrder(id: $id, reason: $reason) { id status } }
`;
export const SET_ORDER_PREPARING = gql`
  mutation SetOrderPreparing($id: ID!) { setOrderPreparing(id: $id) { id status } }
`;
export const MARK_ORDER_READY = gql`
  mutation MarkOrderReady($id: ID!) { markOrderReady(id: $id) { id status } }
`;
export const SET_MENU_ITEM_AVAILABILITY = gql`
  mutation SetAvailability($id: ID!, $availability: ItemAvailability!) {
    setMenuItemAvailability(id: $id, availability: $availability) { id availability }
  }
`;
export const CREATE_MENU_ITEM = gql`
  mutation CreateMenuItem($branchId: ID!, $input: MenuItemInput!) { createMenuItem(branchId: $branchId, input: $input) { id name } }
`;
export const UPDATE_MENU_ITEM = gql`
  mutation UpdateMenuItem($id: ID!, $input: JSONObject!) { updateMenuItem(id: $id, input: $input) { id name price availability } }
`;
export const DELETE_MENU_ITEM = gql`
  mutation DeleteMenuItem($id: ID!) { deleteMenuItem(id: $id) }
`;
export const CREATE_MENU_CATEGORY = gql`
  mutation CreateMenuCategory($branchId: ID!, $input: MenuCategoryInput!) {
    createMenuCategory(branchId: $branchId, input: $input) { id name slot isActive }
  }
`;
export const UPDATE_MENU_CATEGORY = gql`
  mutation UpdateMenuCategory($id: ID!, $input: MenuCategoryInput!) {
    updateMenuCategory(id: $id, input: $input) { id name slot isActive }
  }
`;
export const DELETE_MENU_CATEGORY = gql`
  mutation DeleteMenuCategory($id: ID!) { deleteMenuCategory(id: $id) }
`;

/** Driver */
export const SET_DRIVER_ONLINE = gql`
  mutation SetDriverOnline($online: Boolean!) { setDriverOnline(online: $online) { userId availability } }
`;
export const RESPOND_TO_DELIVERY = gql`
  mutation RespondToDelivery($deliveryId: ID!, $accept: Boolean!, $reason: String) {
    respondToDelivery(deliveryId: $deliveryId, accept: $accept, reason: $reason)
  }
`;
export const UPDATE_DELIVERY_STATUS = gql`
  mutation UpdateDeliveryStatus($deliveryId: ID!, $status: OrderStatus!, $proofPhotoUrl: String) {
    updateDeliveryStatus(deliveryId: $deliveryId, status: $status, proofPhotoUrl: $proofPhotoUrl) { id status }
  }
`;
export const MARK_PICKED_UP = gql`
  mutation MarkPickedUp($deliveryId: ID!) { markPickedUp(deliveryId: $deliveryId) { id status } }
`;
export const MARK_DELIVERED = gql`
  mutation MarkDelivered($deliveryId: ID!, $proofPhotoUrl: String) { markDelivered(deliveryId: $deliveryId, proofPhotoUrl: $proofPhotoUrl) { id status } }
`;

/** Admin */
export const ADMIN_SET_RESTAURANT_STATUS = gql`
  mutation AdminSetRestaurantStatus($id: ID!, $status: RestaurantStatus!, $reason: String) {
    adminSetRestaurantStatus(id: $id, status: $status, reason: $reason) { id status }
  }
`;
export const ADMIN_FEATURE_RESTAURANT = gql`
  mutation AdminFeatureRestaurant($id: ID!, $featured: Boolean!) { adminFeatureRestaurant(id: $id, featured: $featured) { id isFeatured } }
`;
export const ADMIN_SET_DRIVER_APPROVAL = gql`
  mutation AdminSetDriverApproval($userId: ID!, $status: RestaurantStatus!, $reason: String) {
    adminSetDriverApproval(userId: $userId, status: $status, reason: $reason) { userId approvalStatus }
  }
`;
export const ADMIN_SET_DRIVER_SUSPENSION = gql`
  mutation AdminSetDriverSuspension($userId: ID!, $suspended: Boolean!, $reason: String) {
    adminSetDriverSuspension(userId: $userId, suspended: $suspended, reason: $reason) { userId isSuspended }
  }
`;
export const ADMIN_SET_USER_STATUS = gql`
  mutation AdminSetUserStatus($id: ID!, $status: UserStatus!) { adminSetUserStatus(id: $id, status: $status) { id status } }
`;
export const ADMIN_UPSERT_SETTING = gql`
  mutation AdminUpsertSetting($key: String!, $value: JSONObject!) { adminUpsertSetting(key: $key, value: $value) { key value } }
`;
export const UPSERT_SURGE_ZONE = gql`
  mutation UpsertSurgeZone($id: ID, $input: SurgeZoneInput!) { upsertSurgeZone(id: $id, input: $input) { id name multiplier isActive } }
`;
export const TOGGLE_SURGE_ZONE = gql`
  mutation ToggleSurgeZone($id: ID!, $active: Boolean!) { toggleSurgeZone(id: $id, active: $active) { id isActive } }
`;
export const DELETE_SURGE_ZONE = gql`
  mutation DeleteSurgeZone($id: ID!) { deleteSurgeZone(id: $id) }
`;
export const ADMIN_INTERVENE_ORDER = gql`
  mutation AdminInterveneOrder($id: ID!, $action: String!, $note: String) { adminInterveneOrder(id: $id, action: $action, note: $note) { id status } }
`;
export const PROCESS_REFUND = gql`
  mutation ProcessRefund($orderId: ID!, $amount: Decimal, $partial: Boolean, $reason: String) {
    processRefund(orderId: $orderId, amount: $amount, partial: $partial, reason: $reason) { id amount status }
  }
`;
export const ADMIN_CREDIT_WALLET = gql`
  mutation AdminCreditWallet($userId: ID!, $amount: Decimal!, $note: String) { adminCreditWallet(userId: $userId, amount: $amount, note: $note) { id balance } }
`;
export const ADMIN_REASSIGN_DELIVERY = gql`
  mutation AdminReassignDelivery($deliveryId: ID!, $toDriverId: ID) { adminReassignDelivery(deliveryId: $deliveryId, toDriverId: $toDriverId) { id status driver { userId } } }
`;

/** Support queue (staff) */
export const ASSIGN_TICKET = gql`
  mutation AssignTicket($ticketId: ID!, $agentId: ID!) { assignTicket(ticketId: $ticketId, agentId: $agentId) { id status assignedTo { id fullName } } }
`;

/** Restaurant approval / creation */
export const SUBMIT_RESTAURANT_FOR_APPROVAL = gql`
  mutation SubmitRestaurant($input: RestaurantProfileInput!, $docs: JSONObject) {
    submitRestaurantForApproval(input: $input, docs: $docs) { id name status }
  }
`;
export const ADD_BRANCH = gql`
  mutation AddBranch($restaurantId: ID!, $input: BranchInput!) { addBranch(restaurantId: $restaurantId, input: $input) { id name } }
`;
export const SET_BRANCH_HOURS = gql`
  mutation SetBranchHours($branchId: ID!, $hours: [OperatingHoursInput!]!) { setBranchHours(branchId: $branchId, hours: $hours) { id hours { id dayOfWeek openTime closeTime isClosed } } }
`;
