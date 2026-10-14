## Context

Each process reads its event loop delay histogram once a minute. The warning compared the minute's largest delay to
200 ms. In Sentry's 242 events, the largest delays had a median of about 400 ms and a 90th percentile of about 1.3 s,
none past 1.7 s, while the 99th percentile stayed at 3 to 4 ms. The api and the worker show the same distribution.

## Goals / Non-Goals

**Goals:** a warning only for a stall a visitor would feel, or for a minute that ran slow throughout, and no import
pause on a new replica's first page.

**Non-Goals:** finding what pauses every process at once. The machines are Northflank's, and the minute log line keeps
every delay for that work.

## Decisions

- The api warns past a 2 second stall or a 100 ms 99th percentile. No event in Sentry's history reached either, except
  one api minute with a 151 ms 99th percentile. The 99th percentile only passes 100 ms if dozens of the minute's
  samples were delayed, which is a slow minute, not one pause.
- The worker sends no event loop warning. No request waits on it, and a scan that runs long already shows in the scan
  backlog warning.
- The warning keeps its `event-loop-delay` condition, so it stays in the same Sentry issue and the alert rule that
  matches the condition still applies.
- `importUiServer` imports the bundle after the pool sizing and before the gauges start, and `renderUiPage` calls the
  same function, which returns the bundle as loaded, missing, or failed. A failed import is logged and reported at
  startup, and Bun rejects the module's next import the same way, so the first page render also reports it and
  responds 503.

## Risks / Trade-offs

- Stalls between 200 ms and 2 seconds no longer email. They stay in the minute log line.
