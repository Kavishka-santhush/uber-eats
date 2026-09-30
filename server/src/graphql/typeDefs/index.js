const { mergeTypeDefs } = require('@graphql-tools/merge');
const GraphQLScalarType = require('graphql').GraphQLScalarType;
const Kind = require('graphql').Kind;
const { Kind: ASTKind } = require('graphql');

const docs = [
  require('./00_scalars'),
  require('./01_auth'),
  require('./02_restaurants'),
  require('./03_orders'),
  require('./04_payments'),
  require('./05_drivers'),
  require('./06_reviews'),
  require('./07_notifications_tickets'),
  require('./08_admin'),
];

/** Merge all domain SDL into one DocumentNode set. */
const typeDefs = mergeTypeDefs(docs);

// ---- custom scalars -------------------------------------------------

const DateTime = new GraphQLScalarType({
  name: 'DateTime',
  serialize: (v) => (v instanceof Date ? v.toISOString() : v ? new Date(v).toISOString() : null),
  parseValue: (v) => new Date(v),
  parseLiteral: (ast) => (ast.kind === ASTKind.STRING ? new Date(ast.value) : null),
});

const Decimal = new GraphQLScalarType({
  name: 'Decimal',
  serialize: (v) => {
    if (v == null) return null;
    // Prisma.Decimal -> string to preserve precision across JSON
    return typeof v === 'object' && v.toString ? v.toString() : String(v);
  },
  parseValue: (v) => (v === '' || v == null ? null : Number(v)),
  parseLiteral: (ast) => {
    if (ast.kind === ASTKind.INT || ast.kind === ASTKind.FLOAT) return Number(ast.value);
    if (ast.kind === ASTKind.STRING) return ast.value === '' ? null : Number(ast.value);
    return null;
  },
});

const JSONObject = new GraphQLScalarType({
  name: 'JSONObject',
  serialize: (v) => v,
  parseValue: (v) => v,
  parseLiteral: function parse(ast) {
    switch (ast.kind) {
      case Kind.STRING: return ast.value;
      case Kind.BOOLEAN: return ast.value;
      case Kind.INT: case Kind.FLOAT: return Number(ast.value);
      case Kind.OBJECT: {
        const obj = Object.create(null);
        ast.fields.forEach((f) => { obj[f.name.value] = parse(f.value); });
        return obj;
      }
      case Kind.LIST: return ast.values.map(parse);
      case Kind.NULL: return null;
      default: return null;
    }
  },
});

const scalars = { DateTime, Decimal, JSONObject };

module.exports = { typeDefs, scalars };
