#!/usr/bin/env bash
# Creates the Cloudflare resources this Worker binds that `wrangler deploy`
# does not create itself. Idempotent: existing resources are reported and
# skipped. Run once per environment before the first deploy that needs them.
#
#   scripts/provision.sh dev|staging|production
#
# Never run staging/production without the owner's approval — it creates and
# modifies live resources.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_NAME="${1:?usage: scripts/provision.sh dev|staging|production}"
case "$ENV_NAME" in
  dev)        QUEUE=synthire-resume-jobs-dev;     INDEX=synthire-embeddings-dev;     BUCKET="" ;;
  staging)    QUEUE=synthire-resume-jobs-staging; INDEX=synthire-embeddings-staging; BUCKET=synthire-resumes-staging ;;
  production) QUEUE=synthire-resume-jobs;         INDEX=synthire-embeddings;         BUCKET=synthire-resumes ;;
  *) echo "unknown environment: $ENV_NAME" >&2; exit 2 ;;
esac

W=(npx wrangler)

# Runs a create command; "already exists" counts as success.
ensure() {
  local label="$1"; shift
  local out
  if out=$("${W[@]}" "$@" 2>&1); then
    echo "  created  $label"
  elif grep -qiE "already exists|duplicate|conflict|already taken" <<<"$out"; then
    echo "  exists   $label"
  else
    echo "  FAILED   $label" >&2; echo "$out" >&2; return 1
  fi
}

echo "Provisioning $ENV_NAME"
ensure "queue $QUEUE"      queues create "$QUEUE"
ensure "queue $QUEUE-dlq"  queues create "$QUEUE-dlq"

if [[ "$ENV_NAME" == dev ]]; then
  ensure "vectorize index $INDEX" vectorize create "$INDEX" --dimensions=1024 --metric=cosine
fi

metadata_list=$(npx wrangler vectorize list-metadata-index "$INDEX")
for prop in companyId jobId; do
  if grep -q "$prop" <<<"$metadata_list"; then
    echo "  exists   metadata index $INDEX.$prop"
  else
    ensure "metadata index $INDEX.$prop" vectorize create-metadata-index "$INDEX" --propertyName="$prop" --type=string
  fi
done

# Dev R2 is local (Miniflare); lifecycle rules only exist on real buckets.
if [[ -n "$BUCKET" ]]; then
  if "${W[@]}" r2 bucket lifecycle list "$BUCKET" 2>/dev/null | grep -q "jd-pending-expiry"; then
    echo "  exists   lifecycle rule jd-pending-expiry on $BUCKET"
  else
    "${W[@]}" r2 bucket lifecycle add "$BUCKET" jd-pending-expiry jd-pending/ --expire-days 1 --force
    echo "  created  lifecycle rule jd-pending-expiry on $BUCKET"
  fi
fi
echo "Done."
