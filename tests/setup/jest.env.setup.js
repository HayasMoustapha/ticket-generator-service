/**
 * Non-credential test bootstrap.
 * Runs as a jest `setupFiles` (before any module import). dotenv.config() does NOT
 * override already-set env vars, so blanking external-provider creds here forces the
 * services' built-in NODE_ENV==='test' "no provider configured -> mock + log code" path.
 * DB_* are intentionally left to dotenv/.env (live local Postgres 5432). REDIS_HOST is
 * pinned to IPv4 so Bull/Redis queues connect to 127.0.0.1:6379 instead of ::1.
 * This proves integration LOGIC against the real DB/Redis without real Twilio/SMTP/SendGrid/Stripe/PayPal/Firebase creds.
 */
process.env.NODE_ENV = 'test';

// Disable real SMS providers (Twilio / Vonage)
process.env.TWILIO_ACCOUNT_SID = '';
process.env.TWILIO_AUTH_TOKEN = '';
process.env.TWILIO_PHONE_NUMBER = '';
process.env.VONAGE_API_KEY = '';
process.env.VONAGE_API_SECRET = '';
process.env.VONAGE_FROM_NUMBER = '';

// Disable real email providers (SMTP / SendGrid)
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.SMTP_PASSWORD = '';
process.env.SENDGRID_API_KEY = '';

// Disable real payment providers (Stripe / PayPal)
process.env.STRIPE_SECRET_KEY = '';
process.env.STRIPE_WEBHOOK_SECRET = '';
process.env.PAYPAL_CLIENT_ID = '';
process.env.PAYPAL_CLIENT_SECRET = '';

// Disable real push provider (Firebase)
process.env.FIREBASE_PROJECT_ID = '';
process.env.FIREBASE_CLIENT_EMAIL = '';
process.env.FIREBASE_PRIVATE_KEY = '';

// Force IPv4 Redis (localhost->::1 times out; redis listens on 127.0.0.1:6379)
process.env.REDIS_HOST = '127.0.0.1';
