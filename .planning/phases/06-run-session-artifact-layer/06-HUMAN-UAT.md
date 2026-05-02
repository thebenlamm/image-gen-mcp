---
status: passed
phase: 06-run-session-artifact-layer
source: [06-VERIFICATION.md]
started: 2026-05-02T00:29:26Z
updated: 2026-05-02T00:47:12Z
---

# Phase 6 Human UAT - Retention on Restart

## Result

PASSED on 2026-05-02T00:47:12Z using `IMAGE_GEN_OUTPUT_DIR=/private/tmp/image-gen-mcp-phase6-uat`.

- `IMAGE_GEN_RUN_RETENTION_HOURS=1 node dist/index.js < /dev/null` logged `Run retention: scanned=2 deleted=1 skipped=1 retention=1h`.
- The aged strict run directory was deleted.
- The fresh strict run directory remained.
- `run-important` remained, proving retention does not delete arbitrary `run-*` names.
- Unset env logged `retention=24h` and deleted the aged strict run.
- Invalid env logged `Warning: IMAGE_GEN_RUN_RETENTION_HOURS='garbage' is invalid` and `retention=24h`.

This script verifies ROADMAP Phase 6 success criterion #3:
> "Setting `IMAGE_GEN_RUN_RETENTION_HOURS=1` and restarting the server deletes runs older than 1 hour from disk"

Automated tests cover the sweep function in isolation. This UAT proves the server startup -> sweep wiring works end-to-end and that the `isDirectInvocation` guard fires when launched as `node dist/index.js`.

## Setup

1. Build: `npm run build`
2. Set a clean test outputDir to avoid touching real generated images:
   ```bash
   export IMAGE_GEN_OUTPUT_DIR="$HOME/Downloads/phase6-uat-tmp"
   mkdir -p "$IMAGE_GEN_OUTPUT_DIR/.runs"
   ```

## Step 1 - Create one fresh and one aged run

```bash
# Create two run dirs with valid runId format
FRESH_ID="run-$(date -u +%Y-%m-%dT%H-%M-%S-000Z)-aaaaaa"
OLD_ID="run-$(date -u +%Y-%m-%dT%H-%M-%S-000Z)-bbbbbb"
mkdir -p "$IMAGE_GEN_OUTPUT_DIR/.runs/$FRESH_ID"
mkdir -p "$IMAGE_GEN_OUTPUT_DIR/.runs/$OLD_ID"
echo fresh > "$IMAGE_GEN_OUTPUT_DIR/.runs/$FRESH_ID/n1.png"
echo old > "$IMAGE_GEN_OUTPUT_DIR/.runs/$OLD_ID/n1.png"

# Age the OLD dir to 2 hours ago via touch
touch -t $(date -u -v-2H +"%Y%m%d%H%M.%S" 2>/dev/null || date -u -d '2 hours ago' +"%Y%m%d%H%M.%S") \
  "$IMAGE_GEN_OUTPUT_DIR/.runs/$OLD_ID"

ls -la "$IMAGE_GEN_OUTPUT_DIR/.runs/"
```

Expect both directories to exist.

## Step 2 - Start the server with retention=1h

```bash
IMAGE_GEN_RUN_RETENTION_HOURS=1 node dist/index.js < /dev/null &
SERVER_PID=$!
sleep 1
kill $SERVER_PID 2>/dev/null
```

Watch the stderr line. It should print:
`Run retention: scanned=2 deleted=1 skipped=... retention=1h`

## Step 3 - Verify

```bash
ls "$IMAGE_GEN_OUTPUT_DIR/.runs/"
```

PASS criteria:
- `$FRESH_ID` is still present.
- `$OLD_ID` is gone.
- Server stderr shows `deleted=1`.

## Step 4 - Verify default (24h) when env var unset

```bash
touch -t $(date -u -v-25H +"%Y%m%d%H%M.%S" 2>/dev/null || date -u -d '25 hours ago' +"%Y%m%d%H%M.%S") \
  "$IMAGE_GEN_OUTPUT_DIR/.runs/$FRESH_ID"

unset IMAGE_GEN_RUN_RETENTION_HOURS
node dist/index.js < /dev/null &
SERVER_PID=$!
sleep 1
kill $SERVER_PID 2>/dev/null

ls "$IMAGE_GEN_OUTPUT_DIR/.runs/"
```

PASS criteria:
- `$FRESH_ID` is gone (it was aged to 25h, default retention is 24h).
- Stderr shows `retention=24h`.

## Step 5 - Verify invalid env var falls back to 24h

```bash
IMAGE_GEN_RUN_RETENTION_HOURS=garbage node dist/index.js < /dev/null &
SERVER_PID=$!
sleep 1
kill $SERVER_PID 2>/dev/null
```

PASS criteria:
- Stderr contains `Warning: IMAGE_GEN_RUN_RETENTION_HOURS='garbage' is invalid`.
- Stderr also shows `retention=24h`.

## Cleanup

```bash
rm -rf "$IMAGE_GEN_OUTPUT_DIR"
unset IMAGE_GEN_OUTPUT_DIR
unset IMAGE_GEN_RUN_RETENTION_HOURS
```
