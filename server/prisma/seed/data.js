// ==================================================================
// Seed dataset — static reference data used by prisma/seed/index.js
// ==================================================================

const bcrypt = require('bcryptjs');

const PASSWORD = 'Password123!'; // demo-only password for all seeded accounts

const CUISINES = [
  'Burgers', 'Pizza', 'Italian', 'Asian', 'Indian', 'Mexican', 'Middle Eastern',
  'Healthy', 'Desserts', 'Coffee & Tea', 'Seafood', 'Fast Food', 'BBQ',
];

const PLATFORM_SETTINGS = [
  { key: 'commission.rate', value: { percent: 15 } },
  { key: 'loyalty.earn_rate', value: { pointsPerCurrencyUnit: 1 } },
  { key: 'loyalty.redeem_rate', value: { pointsPerCurrencyUnit: 100 } },
  { key: 'order.auto_cancel_minutes', value: { minutes: 15 } },
  { key: 'driver.request_timeout_seconds', value: { seconds: 45 } },
  { key: 'driver.base_fee_km', value: { baseFee: 2.0, perKm: 0.8 } },
  { key: 'platform.name', value: { name: 'QuickBite' } },
  { key: 'platform.currency', value: { currency: 'USD' } },
];

const CUSTOMERS = [
  { fullName: 'Alice Johnson', email: 'alice@example.com', phone: '+10000000001' },
  { fullName: 'Bob Smith', email: 'bob@example.com', phone: '+10000000002' },
  { fullName: 'Carla Mendes', email: 'carla@example.com', phone: '+10000000003' },
  { fullName: 'Dev Anand', email: 'dev@example.com', phone: '+10000000004' },
];

const DRIVERS = [
  { fullName: 'Frank Rider', email: 'frank@example.com', phone: '+10000000101', vehicleType: 'MOTORCYCLE', vehicleModel: 'Honda CB500', vehiclePlate: 'DLV-101' },
  { fullName: 'Grace Wheel', email: 'grace@example.com', phone: '+10000000102', vehicleType: 'BIKE', vehicleModel: 'Trek FX3', vehiclePlate: 'DLV-102' },
  { fullName: 'Hank Courier', email: 'hank@example.com', phone: '+10000000103', vehicleType: 'CAR', vehicleModel: 'Toyota Corolla', vehiclePlate: 'DLV-103' },
];

// City center used for deterministic coordinates (adjust to your demo city)
const CENTER = { lat: 40.7128, lng: -74.006 };

const RESTAURANTS = [
  {
    slug: 'burger-lab',
    name: 'Burger Lab',
    owner: { fullName: 'Ivan Owner', email: 'owner.burgerlab@example.com' },
    cuisines: ['Burgers', 'Fast Food'],
    description: 'Gourmet smash burgers with locally sourced beef and brioche buns.',
    status: 'APPROVED',
    branches: [
      {
        name: 'Downtown',
        addressLine1: '12 Main St',
        city: 'New York',
        country: 'USA',
        latOffset: 0.004, lngOffset: -0.003,
        deliveryRadiusKm: 6, minOrderAmount: 8, deliveryFee: 1.99,
        freeDeliveryAbove: 25, prepTimeMinutes: 18, serviceFeePercent: 5,
        categories: [
          {
            name: 'Burgers', slot: 'ALL_DAY',
            items: [
              { name: 'Classic Smash', price: 9.5, description: 'Beef patty, cheddar, pickles, house sauce.', prepTimeMinutes: 12, isBestSeller: true, tags: { isVegetarian: false, isSpicy: false }, variants: [{ name: 'Size', options: [{ label: 'Single', modifier: 0, isDefault: true }, { label: 'Double', modifier: 4.0 }] }], addOns: [{ name: 'Extra cheese', price: 1.0 }, { name: 'Bacon', price: 1.5 }] },
              { name: 'Fire Chicken Burger', price: 10.5, description: 'Crispy chicken with jalapeño mayo.', prepTimeMinutes: 14, tags: { isSpicy: true } },
              { name: 'Garden Veggie', price: 8.9, description: 'Plant-based patty with vegan aioli.', prepTimeMinutes: 12, tags: { isVegan: true, isVegetarian: true } },
            ],
          },
          {
            name: 'Sides', slot: 'ALL_DAY',
            items: [
              { name: 'Fries', price: 3.5, description: 'Golden crispy fries.' },
              { name: 'Onion Rings', price: 4.5, description: 'Beer-battered rings.' },
            ],
          },
          {
            name: 'Shakes', slot: 'ALL_DAY',
            items: [
              { name: 'Vanilla Shake', price: 5.0, description: 'Hand-spun vanilla shake.' },
              { name: 'Chocolate Shake', price: 5.5, description: 'Belgian chocolate shake.', isNew: true },
            ],
          },
        ],
        combos: [
          { name: 'Burger Meal', description: 'Any burger + fries + shake', discountTo: 15.99, picks: ['Classic Smash', 'Fries', 'Vanilla Shake'] },
        ],
      },
    ],
  },
  {
    slug: 'bella-napoli',
    name: 'Bella Napoli',
    owner: { fullName: 'Julia Romano', email: 'owner.bellanapoli@example.com' },
    cuisines: ['Pizza', 'Italian'],
    description: 'Wood-fired Neapolitan pizza since 1998.',
    status: 'APPROVED',
    branches: [
      {
        name: 'Midtown',
        addressLine1: '88 5th Ave',
        city: 'New York',
        country: 'USA',
        latOffset: -0.006, lngOffset: 0.005,
        deliveryRadiusKm: 5, minOrderAmount: 10, deliveryFee: 2.49,
        freeDeliveryAbove: 30, prepTimeMinutes: 25, serviceFeePercent: 5,
        categories: [
          {
            name: 'Pizza', slot: 'ALL_DAY',
            items: [
              { name: 'Margherita', price: 12.0, description: 'San Marzano tomato, mozzarella, basil.', prepTimeMinutes: 20, isBestSeller: true, tags: { isVegetarian: true }, variants: [{ name: 'Size', options: [{ label: '10"', modifier: 0, isDefault: true }, { label: '12"', modifier: 4.0 }, { label: '16"', modifier: 8.0 }] }], addOns: [{ name: 'Extra mozzarella', price: 2.0 }] },
              { name: 'Diavola', price: 14.5, description: 'Spicy salami, chili, mozzarella.', prepTimeMinutes: 22, tags: { isSpicy: true } },
              { name: 'Quattro Formaggi', price: 15.0, description: 'Four cheese blend.', prepTimeMinutes: 22, tags: { isVegetarian: true } },
            ],
          },
          {
            name: 'Pasta', slot: 'LUNCH',
            items: [
              { name: 'Spaghetti Carbonara', price: 13.0, description: 'Pancetta, egg, pecorino.', prepTimeMinutes: 18 },
              { name: 'Penne Arrabbiata', price: 11.0, description: 'Spicy tomato sauce.', prepTimeMinutes: 15, tags: { isSpicy: true, isVegetarian: true } },
            ],
          },
          {
            name: 'Desserts', slot: 'ALL_DAY',
            items: [
              { name: 'Tiramisu', price: 6.5, description: 'Espresso-soaked ladyfingers, mascarpone.' },
            ],
          },
        ],
        combos: [],
      },
    ],
  },
  {
    slug: 'spice-route',
    name: 'Spice Route',
    owner: { fullName: 'Raj Patel', email: 'owner.spiceroute@example.com' },
    cuisines: ['Indian', 'Asian'],
    description: 'North Indian tandoor classics and biryanis.',
    status: 'APPROVED',
    branches: [
      {
        name: 'Uptown',
        addressLine1: '450 Park Ave',
        city: 'New York',
        country: 'USA',
        latOffset: 0.01, lngOffset: 0.008,
        deliveryRadiusKm: 8, minOrderAmount: 12, deliveryFee: 2.99,
        freeDeliveryAbove: 35, prepTimeMinutes: 24, serviceFeePercent: 6,
        categories: [
          {
            name: 'Mains', slot: 'DINNER',
            items: [
              { name: 'Butter Chicken', price: 14.5, description: 'Tandoori chicken in creamy tomato gravy.', prepTimeMinutes: 22, isBestSeller: true, addOns: [{ name: 'Garlic naan', price: 2.5 }] },
              { name: 'Palak Paneer', price: 12.5, description: 'Cottage cheese in spinach gravy.', tags: { isVegetarian: true } },
              { name: 'Hyderabadi Biryani', price: 15.0, description: 'Layered basmati with choice of chicken or veg.', variants: [{ name: 'Style', options: [{ label: 'Chicken', modifier: 0, isDefault: true }, { label: 'Veg', modifier: -2.0 }] }], tags: { isSpicy: true } },
            ],
          },
          {
            name: 'Breakfast Tandoor', slot: 'BREAKFAST',
            items: [
              { name: 'Paratha Basket', price: 8.0, description: 'Assorted stuffed parathas with chutneys.' },
            ],
          },
        ],
        combos: [
          { name: 'Thali Combo', description: 'Main + rice + naan + dessert', discountTo: 19.99, picks: ['Butter Chicken', 'Hyderabadi Biryani', 'Paratha Basket'] },
        ],
      },
    ],
  },
  {
    slug: 'green-fork',
    name: 'Green Fork',
    owner: { fullName: 'Sara Lee', email: 'owner.greenfork@example.com' },
    cuisines: ['Healthy'],
    description: 'Bowls, salads and cold-pressed juices.',
    status: 'PENDING_APPROVAL', // demonstrates the approval workflow
    branches: [
      {
        name: 'Old Town',
        addressLine1: '7 Harbor Rd',
        city: 'New York',
        country: 'USA',
        latOffset: -0.012, lngOffset: -0.01,
        deliveryRadiusKm: 4, minOrderAmount: 6, deliveryFee: 1.49,
        freeDeliveryAbove: 20, prepTimeMinutes: 12, serviceFeePercent: 4,
        categories: [
          {
            name: 'Bowls', slot: 'ALL_DAY',
            items: [
              { name: 'Buddha Bowl', price: 11.5, description: 'Quinoa, roasted veg, tahini.', tags: { isVegan: true, isGlutenFree: true } },
              { name: 'Caesar Salad', price: 9.9, description: 'Romaine, parmesan, anchovy dressing.', addOns: [{ name: 'Grilled chicken', price: 3.5 }] },
            ],
          },
        ],
        combos: [],
      },
    ],
  },
];

const PROMO_CODES = [
  { code: 'WELCOME50', type: 'FIXED', value: 5.0, description: '$5 off your first order', minOrderAmount: 15, usageLimit: 10000, usagePerUser: 1, validDays: 90 },
  { code: 'YUMMY20', type: 'PERCENTAGE', value: 20, description: '20% off, max $8', minOrderAmount: 20, maxDiscount: 8, usageLimit: 1000, usagePerUser: 2, validDays: 30 },
  { code: 'FREESHIP', type: 'FREE_DELIVERY', value: 0, description: 'Free delivery on any order', minOrderAmount: 10, usageLimit: null, usagePerUser: 5, validDays: 60 },
];

const SURGE_ZONES = [
  { name: 'Downtown Core', latOffset: 0, lngOffset: 0, radiusKm: 1.5, multiplier: 1.5, daysOfWeek: [5, 6] },
  { name: 'Business District', latOffset: 0.008, lngOffset: 0.002, radiusKm: 1.0, multiplier: 1.25, daysOfWeek: [1, 2, 3, 4, 5] },
];

module.exports = {
  bcrypt,
  PASSWORD,
  CUISINES,
  PLATFORM_SETTINGS,
  CUSTOMERS,
  DRIVERS,
  CENTER,
  RESTAURANTS,
  PROMO_CODES,
  SURGE_ZONES,
};
