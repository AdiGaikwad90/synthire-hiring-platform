export interface Env {
  // Cloudflare bindings
  DB: D1Database
  RESUME_BUCKET: R2Bucket
  KV_CACHE: KVNamespace
  VECTORIZE: VectorizeIndex
  AI: Ai

  // Secrets (set via wrangler secret put)
  JWT_SECRET: string
  OPENROUTER_API_KEY: string
  RESEND_API_KEY: string
  RESEND_WEBHOOK_SECRET: string

  // Vars (wrangler.toml [vars])
  ENVIRONMENT: string
  JWT_EXPIRY_SECONDS: string
  FRONTEND_ORIGIN: string
  MAX_UPLOAD_BYTES: string
  RESEND_FROM_EMAIL: string
  RESEND_FROM_NAME: string
  EMAIL_QUEUE_INTERVAL_SECONDS: string
  EMAIL_MAX_RETRIES: string
}
