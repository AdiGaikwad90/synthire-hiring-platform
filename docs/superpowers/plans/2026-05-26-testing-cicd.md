# Testing & CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Vitest unit tests for backend pure functions, a GitHub Actions CI pipeline that runs typecheck + tests on every push, and a staging Cloudflare environment in wrangler.toml.

**Architecture:** Tests run inside the `@cloudflare/vitest-pool-workers` pool so they execute against the actual Workers runtime rather than Node.js; CI runs backend typecheck + test and frontend typecheck + build as parallel jobs; the staging env in wrangler.toml mirrors production but points at separate Cloudflare resources.

**Tech Stack:** Vitest, @cloudflare/vitest-pool-workers, GitHub Actions, wrangler.toml env stanzas

---

## Task 1 — Install Vitest and write backend unit tests

**Goal:** Install testing dependencies, configure Vitest for Workers, and write tests for the two most important pure-function modules: `escapeHtml`/`safeHref` (XSS utils added by the security hardening plan) and `aggregateScore` (scoring engine).

- [ ] **Install dev dependencies**

  ```bash
  cd /Users/newpage/Documents/TS_CF_Hackathon/backend
  npm install --save-dev vitest @cloudflare/vitest-pool-workers
  ```

- [ ] **Create `backend/vitest.config.ts`**

  Create the file with this exact content:

  ```typescript
  import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

  export default defineWorkersConfig({
    test: {
      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.toml' },
        },
      },
    },
  })
  ```

- [ ] **Add test scripts to `backend/package.json`**

  Find the `"scripts"` block and add two entries:

  ```json
  "test": "vitest run",
  "test:watch": "vitest"
  ```

- [ ] **Create `backend/src/tests/` directory and `escapeHtml.test.ts`**

  This test file depends on `backend/src/utils/html.ts` which is created by the security hardening plan. Create it at `backend/src/tests/escapeHtml.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest'
  import { escapeHtml, safeHref } from '../utils/html'

  describe('escapeHtml', () => {
    it('escapes & < > " \' /', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
      )
    })
    it('returns empty string for null', () => {
      expect(escapeHtml(null)).toBe('')
    })
    it('returns empty string for undefined', () => {
      expect(escapeHtml(undefined)).toBe('')
    })
    it('passes through plain text unchanged', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World')
    })
    it('escapes ampersand', () => {
      expect(escapeHtml('a & b')).toBe('a &amp; b')
    })
  })

  describe('safeHref', () => {
    it('allows https URLs', () => {
      expect(safeHref('https://example.com/path')).toBe('https://example.com/path')
    })
    it('blocks http URLs', () => {
      expect(safeHref('http://example.com')).toBe('#')
    })
    it('blocks javascript: URLs', () => {
      expect(safeHref('javascript:alert(1)')).toBe('#')
    })
    it('blocks data: URLs', () => {
      expect(safeHref('data:text/html,<h1>hi</h1>')).toBe('#')
    })
    it('returns # for null', () => {
      expect(safeHref(null)).toBe('#')
    })
    it('returns # for undefined', () => {
      expect(safeHref(undefined)).toBe('#')
    })
  })
  ```

- [ ] **Create `backend/src/tests/scoring.test.ts`**

  The real function is `aggregateScore` from `../services/scoring/aggregator`. It takes `(llmScores: LLMScores, semanticScore: number, dimensions: ScoringDimensions, config?: ScoreConfig)` and returns `{ overall, componentScore, dimensionScores }`. Import `DEFAULT_SCORING_DIMENSIONS` from `../services/scoring/dimensions`.

  Create `backend/src/tests/scoring.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest'
  import { aggregateScore } from '../services/scoring/aggregator'
  import { DEFAULT_SCORING_DIMENSIONS } from '../services/scoring/dimensions'
  import type { LLMScores } from '../services/ai/prompts/score-candidate'

  // Perfect LLM scores: all sub-dimensions return 100
  const perfectLlmScores: LLMScores = {
    dimensions: {
      skills:       { technical: 100, soft: 100, domain: 100 },
      experience:   { years_relevant: 100, industry_match: 100, leadership: 100 },
      education:    { degree_level: 100, field_relevance: 100, certifications: 100 },
      achievements: { impact: 100, recognition: 100 },
    },
  }

  // Zero LLM scores: all sub-dimensions return 0
  const zeroLlmScores: LLMScores = {
    dimensions: {
      skills:       { technical: 0, soft: 0, domain: 0 },
      experience:   { years_relevant: 0, industry_match: 0, leadership: 0 },
      education:    { degree_level: 0, field_relevance: 0, certifications: 0 },
      achievements: { impact: 0, recognition: 0 },
    },
  }

  describe('aggregateScore', () => {
    it('returns overall = 100 when all inputs are perfect', () => {
      const result = aggregateScore(
        perfectLlmScores,
        100,
        DEFAULT_SCORING_DIMENSIONS,
        { llmWeight: 0.7, semanticWeight: 0.3 }
      )
      expect(result.overall).toBe(100)
    })

    it('returns overall = 0 when all inputs are zero', () => {
      const result = aggregateScore(
        zeroLlmScores,
        0,
        DEFAULT_SCORING_DIMENSIONS,
        { llmWeight: 0.7, semanticWeight: 0.3 }
      )
      expect(result.overall).toBe(0)
    })

    it('overall is clamped to 100 even when weights exceed 1', () => {
      const result = aggregateScore(
        perfectLlmScores,
        100,
        DEFAULT_SCORING_DIMENSIONS,
        { llmWeight: 1.0, semanticWeight: 1.0 }
      )
      expect(result.overall).toBe(100)
    })

    it('overall is clamped to 0 even when weights are negative', () => {
      const result = aggregateScore(
        zeroLlmScores,
        0,
        DEFAULT_SCORING_DIMENSIONS,
        { llmWeight: -1.0, semanticWeight: -1.0 }
      )
      expect(result.overall).toBe(0)
    })

    it('returns a number between 0 and 100 for mid-range inputs', () => {
      const midScores: LLMScores = {
        dimensions: {
          skills:       { technical: 70, soft: 50, domain: 60 },
          experience:   { years_relevant: 65, industry_match: 55, leadership: 40 },
          education:    { degree_level: 80, field_relevance: 75, certifications: 30 },
          achievements: { impact: 60, recognition: 45 },
        },
      }
      const result = aggregateScore(midScores, 60, DEFAULT_SCORING_DIMENSIONS)
      expect(result.overall).toBeGreaterThanOrEqual(0)
      expect(result.overall).toBeLessThanOrEqual(100)
    })

    it('returns integer values (rounded)', () => {
      const midScores: LLMScores = {
        dimensions: {
          skills:       { technical: 73, soft: 51, domain: 62 },
          experience:   { years_relevant: 67, industry_match: 58, leadership: 44 },
          education:    { degree_level: 82, field_relevance: 76, certifications: 33 },
          achievements: { impact: 61, recognition: 48 },
        },
      }
      const result = aggregateScore(midScores, 63, DEFAULT_SCORING_DIMENSIONS)
      expect(Number.isInteger(result.overall)).toBe(true)
      expect(Number.isInteger(result.componentScore)).toBe(true)
    })

    it('result shape contains overall, componentScore, and dimensionScores', () => {
      const result = aggregateScore(perfectLlmScores, 80, DEFAULT_SCORING_DIMENSIONS)
      expect(result).toHaveProperty('overall')
      expect(result).toHaveProperty('componentScore')
      expect(result).toHaveProperty('dimensionScores')
      expect(result.dimensionScores).toHaveProperty('skills')
      expect(result.dimensionScores).toHaveProperty('experience')
      expect(result.dimensionScores).toHaveProperty('education')
      expect(result.dimensionScores).toHaveProperty('achievements')
    })

    it('falls back to legacy skills_score when sub-dimensions are missing', () => {
      const legacyScores = { skills_score: 90 } as unknown as LLMScores
      const result = aggregateScore(legacyScores, 0, DEFAULT_SCORING_DIMENSIONS, {
        llmWeight: 1.0,
        semanticWeight: 0.0,
      })
      // skills dimension should roll up from the legacy flat value
      expect(result.dimensionScores.skills).toBe(90)
    })
  })
  ```

- [ ] **Verify tests can be discovered (dry run)**

  ```bash
  cd /Users/newpage/Documents/TS_CF_Hackathon/backend
  npx vitest run --reporter=verbose 2>&1 | head -40
  ```

  Tests for `escapeHtml` will fail until `backend/src/utils/html.ts` exists (security plan task). Tests for `aggregateScore` should pass immediately since `aggregator.ts` already exists. If the Workers pool config causes issues locally (no wrangler login), add `--pool=forks` as a fallback: `npx vitest run --pool=forks`.

---

## Task 2 — GitHub Actions CI pipeline

**Goal:** Create a two-job CI workflow that runs on every push to `main` or `feature/**` branches and on pull requests targeting `main`. The backend job runs typecheck then `vitest run`; the frontend job runs typecheck then `next build`.

- [ ] **Create the `.github/workflows/` directory structure**

  ```bash
  mkdir -p /Users/newpage/Documents/TS_CF_Hackathon/.github/workflows
  ```

- [ ] **Create `.github/workflows/ci.yml`**

  Create the file with this exact content:

  ```yaml
  name: CI

  on:
    push:
      branches: [main, 'feature/**']
    pull_request:
      branches: [main]

  jobs:
    backend:
      name: Backend — typecheck + test
      runs-on: ubuntu-latest
      defaults:
        run:
          working-directory: backend
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: '20'
            cache: 'npm'
            cache-dependency-path: backend/package-lock.json
        - run: npm ci
        - name: Typecheck
          run: npm run typecheck
        - name: Test
          run: npm test

    frontend:
      name: Frontend — typecheck + build
      runs-on: ubuntu-latest
      defaults:
        run:
          working-directory: frontend
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: '20'
            cache: 'npm'
            cache-dependency-path: frontend/package-lock.json
        - run: npm ci
        - name: Typecheck
          run: npm run typecheck
        - name: Build
          run: npm run build
          env:
            NEXT_PUBLIC_API_URL: http://localhost:8787
  ```

- [ ] **Verify the YAML syntax is valid**

  ```bash
  cd /Users/newpage/Documents/TS_CF_Hackathon
  npx js-yaml .github/workflows/ci.yml && echo "YAML valid"
  ```

  If `js-yaml` is not available, run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML valid"`.

- [ ] **Confirm the workflow file is in the correct location**

  ```bash
  ls -la /Users/newpage/Documents/TS_CF_Hackathon/.github/workflows/
  ```

  Expected output includes `ci.yml`. The `.github/` directory must be at the repo root (same level as `backend/` and `frontend/`), not inside either subdirectory.

---

## Task 3 — Staging environment in wrangler.toml

**Goal:** Add an `[env.staging]` stanza to `backend/wrangler.toml` that mirrors the production env but references separate D1/KV/R2/Vectorize resources, and add a `deploy:staging` npm script.

- [ ] **Append the staging env block to `backend/wrangler.toml`**

  Open `backend/wrangler.toml` and append the following block after the last line (after `[env.production.triggers]`):

  ```toml
  [env.staging.vars]
  ENVIRONMENT = "staging"
  FRONTEND_ORIGIN = "https://synthire-staging.pages.dev"
  JWT_EXPIRY_SECONDS = "86400"
  MAX_UPLOAD_BYTES = "10485760"
  EMAIL_PROVIDER = "resend"
  RESEND_FROM_EMAIL = "onboarding@resend.dev"
  RESEND_FROM_NAME = "Synthire"
  EMAIL_QUEUE_INTERVAL_SECONDS = "30"
  EMAIL_MAX_RETRIES = "3"
  LLM_MODEL_PRIMARY  = "@cf/meta/llama-3.1-8b-instruct"
  LLM_MODEL_FALLBACK = "@cf/meta/llama-3.2-3b-instruct"
  LLM_TEMPERATURE = "0.1"
  LLM_MAX_TOKENS = "2000"
  NEURONS_DAILY_LIMIT = "1000"
  RATE_LIMIT_ENABLED = "true"
  RATE_LIMIT_REQUESTS = "100"
  RATE_LIMIT_WINDOW_SECONDS = "60"

  [[env.staging.d1_databases]]
  binding = "DB"
  database_name = "synthire-staging"
  database_id = "REPLACE_WITH_STAGING_DATABASE_ID"
  migrations_dir = "src/db/migrations"

  [[env.staging.r2_buckets]]
  binding = "RESUME_BUCKET"
  bucket_name = "synthire-resumes-staging"

  [[env.staging.kv_namespaces]]
  binding = "KV_CACHE"
  id = "REPLACE_WITH_STAGING_KV_ID"
  preview_id = "REPLACE_WITH_STAGING_KV_PREVIEW_ID"

  [[env.staging.vectorize]]
  binding = "VECTORIZE"
  index_name = "synthire-embeddings-staging"

  [env.staging.ai]
  binding = "AI"

  [env.staging.triggers]
  crons = ["* * * * *"]
  ```

- [ ] **Add `deploy:staging` script to `backend/package.json`**

  In the `"scripts"` block, add:

  ```json
  "deploy:staging": "wrangler deploy --env staging"
  ```

- [ ] **Provision staging Cloudflare resources (run once, fill IDs back in)**

  When ready to deploy staging for the first time, run these commands and copy the output IDs into `wrangler.toml` replacing the `REPLACE_WITH_STAGING_*` placeholders:

  ```bash
  wrangler d1 create synthire-staging
  # → copy database_id into [[env.staging.d1_databases]] database_id

  wrangler kv:namespace create KV_CACHE_STAGING
  # → copy id into [[env.staging.kv_namespaces]] id

  wrangler kv:namespace create KV_CACHE_STAGING --preview
  # → copy id into [[env.staging.kv_namespaces]] preview_id

  wrangler r2 bucket create synthire-resumes-staging
  # bucket name already set — no ID needed

  wrangler vectorize create synthire-embeddings-staging --dimensions=1024 --metric=cosine
  # index name already set — no ID needed

  # Apply schema to staging D1
  wrangler d1 migrations apply synthire-staging --env staging
  ```

- [ ] **Verify wrangler parses the config without errors**

  ```bash
  cd /Users/newpage/Documents/TS_CF_Hackathon/backend
  npx wrangler deploy --env staging --dry-run 2>&1 | tail -20
  ```

  Expected: wrangler reports the staging worker config (name, entrypoint, bindings) without parse errors. It will warn that `REPLACE_WITH_STAGING_DATABASE_ID` is a placeholder — that is acceptable until real IDs are filled in.

- [ ] **Verify typecheck still passes after all changes**

  ```bash
  cd /Users/newpage/Documents/TS_CF_Hackathon/backend
  npm run typecheck
  ```

  Must report zero errors in `src/`. Duplicate-identifier warnings from `node_modules` are expected — ignore them.
