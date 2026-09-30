require('dotenv').config();

const z = require('zod');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  GOOGLE_MAPS_API_KEY: z.string().default(''),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  OPENROUTER_API_KEY: z.string().default(''),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL: z.string().default('openai/gpt-4o'),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(10),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(2525),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  CLIENT_WEB_ORIGIN: z.string().default('http://localhost:3000'),
  OTP_MOCK: z.enum(['true', 'false']).default('true'),
  ORDER_AUTO_CANCEL_MINUTES: z.coerce.number().default(15),
  DRIVER_REQUEST_TIMEOUT_SECONDS: z.coerce.number().default(45),
  PLATFORM_CURRENCY: z.string().default('USD'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail loudly — misconfiguration must never boot the server silently.
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

module.exports = {
  ...env,
  isProd: env.NODE_ENV === 'production',
  maxFileSizeBytes: env.MAX_FILE_SIZE_MB * 1024 * 1024,
  otpMock: env.OTP_MOCK === 'true',
  accessTokenTtl: '15m',
  refreshTokenTtlDays: 30,
};
