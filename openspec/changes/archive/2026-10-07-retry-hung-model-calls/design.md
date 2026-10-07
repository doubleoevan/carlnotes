## Context

Every model call goes from the worker through the LiteLLM proxy to Fireworks. The worker's fetch aborts at
`MODEL_TIMEOUT_MS`, and the proxy set no timeout or retry of its own, so a call that hangs upstream holds its
connection until the worker gives up. Prod traces over three days, about 4,000 generations:

| Model | Calls | Median | 95th percentile | 99th percentile | Longest |
|---|---|---|---|---|---|
| cheap-model | 2,381 | 1s | 9s | 29s | 84s |
| score-model | 1,619 | 21s | 47s | 63s | 120s, the worker's abort |

The score model writes the podcast outline and segments as well as the scores, so its long calls are real work: 19 ran
past 60 seconds and 4 past 90. A hung call that the worker aborted leaves no end time in the trace, so the table
undercounts them. Sentry counts 385.

## Goals / Non-Goals

**Goals:**

- A hung call is retried by the proxy before the worker gives up on it.
- No timeout cuts off a call that is still doing real work.

**Non-Goals:**

- Changing how the proxy retries a rate limit or a server error. The router retries those twice by default, and the
  AI SDK in the worker retries them again.
- Timeouts for the coding-agent models in the same config, `plan-model`, `apply-model`, and `aside-model`, which the
  app never calls.

## Decisions

- **A timeout per model, above its longest real call.** `timeout` bounds a whole response. The cheap model gets 45
  seconds against a 29-second 99th percentile, the score model 150 against real calls past 90, the chat model 120,
  where the evals' longest reply took 48, and the embedding model 30. A one-size timeout would either cut off podcast
  writing or wait too long on a hung scoring call.
- **A first-chunk limit for a stream.** `stream_timeout` bounds the wait for a streamed reply's first chunk, which
  arrives in seconds if the model is working: 30 seconds for the cheap model, 45 for the chat model, and 60 for the score model.
- **One retry, on a timeout only.** `router_settings.retry_policy` sets `TimeoutErrorRetries: 1`. One retry clears a
  hang, and a second would mostly add cost if the model itself is down.
- **The worker's timeout above the proxy's worst case.** The score model's 150 seconds, run twice with LiteLLM's short
  backoff, stays under 330 seconds, so `MODEL_TIMEOUT_MS` defaults to 360,000. The Scan stages allow 30 minutes and the
  podcast script activities 10, so both have room. The scan report's cheap call runs in the review stage, where the AI
  SDK retries it up to 4 times. Even 45 seconds run twice on every attempt stays well inside 30 minutes. Its summary is
  left empty if every attempt fails.

## Risks / Trade-offs

- A call that legitimately runs past its model's timeout is cut off and retried, and fails if the retry is as long.
  The limits sit well above every app call measured, and the evals and Sentry will show any that start failing. The
  eval grader's score-model calls can still run past 150 seconds.
- The proxy returns a 408 for a call that timed out twice, and the worker's AI SDK retries a 408 up to twice more, so a
  model that is down holds a call for up to six attempts. The Scan stages heartbeat on a timer and allow 30 minutes, so
  the Scan survives it, and the call still fails in the end.
- A proxy that itself stops responding holds a call for up to six minutes instead of two. That is still bounded,
  and it was not the failure that the traces show.
- A call that runs past its model's timeout on both attempts still fails. The team chat eval at `--repeat 3` broke on
  6 of its 12 runs before the change and 4 of 12 after. After it, every writer call finished, and all four broken
  runs were the grader's score-model calls, which ran past 150 seconds on both attempts.
