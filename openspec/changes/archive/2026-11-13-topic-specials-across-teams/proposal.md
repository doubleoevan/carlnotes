## Why

Topic Specials and Podcast Specials counted only the topics a person owns outside any team. A person whose topics
live on teams saw empty or partial Specials, even though those topics are theirs.

## What Changes

- Topic Dashboard and Podcast Dashboard count every topic their person owns, on any of their teams or on none.
- Team Dashboard keeps its topics as they are.
- The nightly build and the rebuild after a topic change include a team topic's owner's Topic and Podcast Dashboards.

## Capabilities

### New Capabilities

### Modified Capabilities

- `specials-dashboards`: Topic and Podcast Dashboards read every topic their person owns, team topics included.

## Impact

- `apps/worker/dashboards/dashboardDailyCountRows.ts`, `dashboardSubjects.ts`, and `packages/pipeline/dashboardRebuild.ts`
- The Specials docs page
