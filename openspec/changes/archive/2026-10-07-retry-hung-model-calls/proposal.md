## Why

A call through the LiteLLM proxy to Fireworks sometimes hangs. Nothing retries it, so it sits until the worker's own
fetch aborts at `MODEL_TIMEOUT_MS`, 120 seconds. Prod Sentry has recorded 385 of these `TimeoutError`s in the scoring
stage since August, each one a Resource that a Scan never scored, and the evals break on the same hangs, with up to a
third of a run's cases lost to them. Calls that finish take seconds. Over three days of prod traces, the cheap model's
99th percentile is 29 seconds and the score model's is 63 seconds, while a hung call waits out the full 120.

## What Changes

- Each model in the proxy's model list that the app calls gets its own timeout in `litellm-config.yaml`, set above
  the longest call that the model makes. That is 45 seconds for the cheap model, 150 for the score model, 120 for the
  chat model, and 30 for the embedding model. The score model also writes the podcast scripts. A streamed reply also
  gets a limit on its first chunk.
- The proxy retries a call that times out once, so a hung call is replaced by a fresh one instead of failing.
- `MODEL_TIMEOUT_MS` defaults to six minutes, above the proxy's longest timeout run twice, so the worker never aborts a
  call that the proxy is still retrying. It still bounds a call if the proxy itself stops responding.

## Capabilities

### New Capabilities

### Modified Capabilities

- `scheduled-scans`: a model call is bounded by a per-model proxy timeout with one retry, inside the worker's own timeout

## Impact

- `litellm-config.yaml`: per-model `timeout` and `stream_timeout`, and a `router_settings` retry policy for timeouts.
  The prod proxy picks it up on its next deploy.
- `worker/models.ts`: the `MODEL_TIMEOUT_MS` default.
- `.env.example` and `evals/README.md`: the new default and what a broken case means.
