## Why

The event loop warning fires when any single pause in a minute passes 200 ms, on the api and the worker alike. Sentry
has 242 of them since September 29. Their 99th percentile delay is 3 to 4 ms, so the processes are healthy around
each pause. Half come from the worker, where no visitor waits on the event loop. A quarter happen within a minute of
another process's pause, which points at the machines the containers share instead of the app's code. The warning sends
an email every hour or two that nobody can act on.

A new api replica also imports the ui's server bundle on its first page request, so the first visitor after a deploy
waits on the import, and the pause it causes shows up as one of those warnings.

## What Changes

- The event loop warning is sent only by the api, and only for a minute with a stall past 2 seconds or a 99th
  percentile delay past 100 ms. The worker's delays and shorter stalls stay in the minute log line.
- The api imports the ui's server bundle at startup, before it serves.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `performance-telemetry`: the event loop threshold and the process that sends its warning.
- `static-serving`: the api imports the ui's server build before it serves.

## Impact

- `shared/runtimeGauges.ts`: `toRuntimeThresholdCrossings` takes the process name and the two new thresholds.
- `api/index.ts`: `importUiServer` runs at startup, beside the pool sizing, and serves `renderUiPage`'s import too.
