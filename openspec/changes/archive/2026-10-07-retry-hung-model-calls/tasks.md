## 1. The proxy

- [x] 1.1 Give cheap-model, score-model, chat-model, and embed-model a `timeout`, and each but embed-model a
  `stream_timeout`, in `litellm-config.yaml`, and retry a timeout once through `router_settings.retry_policy`
- [x] 1.2 Confirm on the local proxy that a call past its timeout is retried once and then fails

## 2. The worker

- [x] 2.1 Default `MODEL_TIMEOUT_MS` to six minutes in `worker/models.ts` and `.env.example`

## 3. Measure

- [x] 3.1 Run the team chat eval at `--repeat 3` before and after, and record its broken runs
- [x] 3.2 Update `evals/README.md` on what a broken case means
