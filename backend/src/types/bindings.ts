export interface Env {
  // ── Cloudflare bindings (wrangler.toml — NOT runtime env vars) ─────────────
  // NOTE: D1, R2, KV, Vectorize, AI are injected as typed objects by the CF
  // runtime. You never read raw IDs at runtime — that's wrangler.toml's job.
  DB: D1Database
  RESUME_BUCKET: R2Bucket
  KV_CACHE: KVNamespace
  VECTORIZE: VectorizeIndex
  AI: Ai

  // ── Secrets (.dev.vars locally / wrangler secret put in production) ────────
  JWT_SECRET: string
  RESEND_API_KEY: string
  RESEND_WEBHOOK_SECRET: string
  SENDGRID_API_KEY: string

  // ── Runtime vars (wrangler.toml [vars] — safe to commit, not secret) ───────

  // App
  ENVIRONMENT: string
  FRONTEND_ORIGIN: string            // CORS allowed origin + base URL for email links

  // Auth
  JWT_EXPIRY_SECONDS: string         // default: "86400" (24 h)

  // File upload
  MAX_UPLOAD_BYTES: string           // default: "10485760" (10 MB)
  ALLOWED_FILE_TYPES: string         // default: "pdf,docx" (comma-separated)

  // LLM — Workers AI native models (change in wrangler.toml without touching code)
  LLM_MODEL_PRIMARY: string          // default: "@cf/meta/llama-3-70b-instruct"
  LLM_MODEL_FALLBACK: string         // default: "@cf/meta/llama-3-8b-instruct"
  LLM_TEMPERATURE: string            // default: "0.1"
  LLM_MAX_TOKENS: string             // default: "2000"
  NEURONS_DAILY_LIMIT: string        // default: "10000" — hard cap, stops AI calls when reached

  // Scoring composition
  SCORE_LLM_WEIGHT: string           // default: "0.70"  (LLM dimension scores %)
  SCORE_SEMANTIC_WEIGHT: string      // default: "0.30"  (cosine similarity %)
  SCORE_HIGH_THRESHOLD: string       // default: "80"    (strong match threshold)
  SCORE_MEDIUM_THRESHOLD: string     // default: "60"    (medium match threshold)

  // KV cache TTLs (seconds)
  CACHE_PARSE_TTL: string            // default: "2592000" (30 days)
  CACHE_EMBED_TTL: string            // default: "2592000" (30 days)
  CACHE_SCORE_TTL: string            // default: "604800"  (7 days)

  // Email
  EMAIL_PROVIDER: string             // "resend" | "sendgrid" — default: "resend"
  RESEND_FROM_EMAIL: string          // sender address (used by both providers)
  RESEND_FROM_NAME: string           // sender name (used by both providers)
  SENDGRID_FROM_EMAIL: string        // optional override for SendGrid sender address
  EMAIL_QUEUE_BATCH_SIZE: string     // default: "10"
  EMAIL_MAX_RETRIES: string          // default: "3"
  EMAIL_RETRY_BACKOFF_SECONDS: string // default: "60"

  // Rate limiting (KV-backed, fixed window)
  RATE_LIMIT_ENABLED: string         // default: "true"
  RATE_LIMIT_REQUESTS: string        // default: "100" (per window)
  RATE_LIMIT_WINDOW_SECONDS: string  // default: "60"

  // R2 budget guardrails — prevents accidental overage on free tier
  // Class A (PutObject)  = paid: $4.50/million, 1M free/month
  // Class B (GetObject)  = paid: $0.36/million, 10M free/month
  // DeleteObject         = FREE — not tracked
  R2_LIMITS_ENABLED: string          // default: "true"
  R2_MAX_STORAGE_BYTES: string       // default: "10737418240" (10 GB free tier)
  R2_MAX_CLASS_A_OPS_MONTHLY: string // default: "900000"  (90% of 1M free tier)
  R2_MAX_CLASS_B_OPS_MONTHLY: string // default: "9000000" (90% of 10M free tier)
}
