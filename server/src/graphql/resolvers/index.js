const { mergeResolvers } = require('@graphql-tools/merge');
const { scalars } = require('../typeDefs');

/**
 * Merge every domain resolver map into one Apollo v4 resolver object.
 * Each domain file exports { Query, Mutation, <TypeName>: {...} }; the
 * Query/Mutation buckets are combined and per-type field resolvers keyed
 * by type name are deep-merged. Custom scalar instances are attached last.
 */

const domains = [
  require('./auth'),
  require('./restaurants'),
  require('./orders'),
  require('./drivers'),
  require('./payments'),
  require('./reviews'),
  require('./notifications_tickets'),
  require('./admin'),
];

// `__internals` on orders is a helper bag, not a resolver map — drop it before
// merging so it is never interpreted as a GraphQL type.
const cleaned = domains.map((d) => {
  if (d && d.__internals) {
    const { __internals, ...rest } = d;
    return rest;
  }
  return d;
});

module.exports = mergeResolvers([...cleaned, scalars]);
