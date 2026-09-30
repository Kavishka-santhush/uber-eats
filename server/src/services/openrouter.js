const axios = require('axios');
const env = require('../config/env');
const logger = require('../config/logger');

/**
 * OpenRouter AI service — recommendations, delivery-time prediction,
 * smart search ranking, menu description generation, ticket classification,
 * demand prediction and the support chatbot.
 *
 * Every function degrades gracefully: if OpenRouter is unreachable or the
 * key is missing we fall back to heuristics so orders never block on AI.
 */

const http = axios.create({
  baseURL: env.OPENROUTER_BASE_URL,
  timeout: 15000,
  headers: {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    'HTTP-Referer': 'https://quickbite.io',
    'X-Title': 'QuickBite Platform',
    'Content-Type': 'application/json',
  },
});

async function chat(messages, { json = false, temperature = 0.4 } = {}) {
  if (!env.OPENROUTER_API_KEY) return null;
  try {
    const { data } = await http.post('/chat/completions', {
      model: env.OPENROUTER_MODEL,
      messages,
      temperature,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    });
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    if (json) {
      try { return JSON.parse(content); } catch { return null; }
    }
    return content;
  } catch (e) {
    logger.warn(`OpenRouter call failed: ${e.message}`);
    return null;
  }
}

/** Personalized restaurant/dish recommendations from order history. */
async function recommend(historySummary) {
  const out = await chat([
    { role: 'system', content: 'You are a food-delivery recommendation engine. Reply with JSON: {"restaurants":["..."],"dishes":["..."],"reason":"..."}' },
    { role: 'user', content: `Customer order history:\n${historySummary}` },
  ], { json: true });
  if (out) return out;
  // heuristic fallback
  return { restaurants: [], dishes: [], reason: 'No AI history yet — showing trending.' };
}

/**
 * Delivery time prediction (minutes) given structured context.
 * Falls back to prep + drive-time heuristic.
 */
async function predictDeliveryMinutes(ctx, heuristicMinutes) {
  const out = await chat([
    { role: 'system', content: 'You predict food delivery times in whole minutes. Reply JSON: {"minutes": number, "confidence": number, "reason": string}' },
    { role: 'user', content: JSON.stringify(ctx) },
  ], { json: true });
  if (out && Number.isFinite(Number(out.minutes))) {
    return Math.min(180, Math.max(5, Math.round(Number(out.minutes))));
  }
  return heuristicMinutes;
}

/** Ranks autocomplete search suggestions by relevance to the query. */
async function rankSuggestions(query, candidates) {
  const out = await chat([
    { role: 'system', content: 'Rank these food search suggestions for the query. Return JSON {"order":[indices]}' },
    { role: 'user', content: `Query: ${query}\nCandidates: ${JSON.stringify(candidates.slice(0, 25))}` },
  ], { json: true });
  if (out && Array.isArray(out.order)) {
    return out.order.filter((i) => candidates[i]).map((i) => candidates[i]);
  }
  return candidates.slice(0, 8);
}

/** Generates an appetizing menu item description. */
async function generateMenuDescription(name, notes) {
  return (await chat([
    { role: 'system', content: 'Write a mouth-watering 2-sentence menu description. Plain text only.' },
    { role: 'user', content: `Dish: ${name}. Notes: ${notes || 'n/a'}` },
  ], { temperature: 0.8 }))
    || `${name} — freshly prepared, made to order with quality ingredients.`;
}

/** Classifies a support ticket into a category + priority (1-5). */
async function classifyTicket(subject, description) {
  const out = await chat([
    { role: 'system', content: 'Classify the support ticket. Reply JSON: {"category":"ORDER_ISSUE|PAYMENT_ISSUE|DELIVERY_ISSUE|ACCOUNT_ISSUE|RESTAURANT_ISSUE|DRIVER_ISSUE|OTHER","priority":1-5}' },
    { role: 'user', content: `Subject: ${subject}\n${description}` },
  ], { json: true });
  return out || { category: 'OTHER', priority: 3 };
}

/** Demand prediction: busy hours per restaurant for prep planning. */
async function predictDemand(hourlyOrderCounts) {
  const out = await chat([
    { role: 'system', content: 'Given hourly order counts, predict next busiest windows. JSON: {"windows":[{"hour":0-23,"level":"low|medium|high"}]}' },
    { role: 'user', content: JSON.stringify(hourlyOrderCounts) },
  ], { json: true });
  return out || { windows: [] };
}

/** Customer-support chatbot grounded on order context. */
async function supportChatbot({ orderSummary }, conversation) {
  return await chat([
    { role: 'system', content: `You are QuickBite support. Be concise and friendly. Context: ${orderSummary || 'none'}` },
    ...conversation.map((m) => ({ role: m.role, content: m.content })),
  ]);
}

module.exports = {
  recommend, predictDeliveryMinutes, rankSuggestions,
  generateMenuDescription, classifyTicket, predictDemand, supportChatbot,
};
