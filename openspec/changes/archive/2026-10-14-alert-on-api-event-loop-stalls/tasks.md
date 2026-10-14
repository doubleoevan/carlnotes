## 1. Alert only on the api's real stalls

- [x] 1.1 Pass the process name to `toRuntimeThresholdCrossings` and warn only for the api past a 2 second stall or a
  100 ms 99th percentile
- [x] 1.2 Cover a slow minute, a short stall, and the worker in `shared/runtimeGauges.test.ts`

## 2. Load the page bundle at startup

- [x] 2.1 Import the ui's server bundle in `api/index.ts` before the api serves
