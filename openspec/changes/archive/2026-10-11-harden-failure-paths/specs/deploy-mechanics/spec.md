## MODIFIED Requirements

### Requirement: The api and the worker run as replicas within the pool rule

The app service and the temporal-worker service SHALL each run as one or more replicas, set in the platform, and the
count SHALL respect the pool rule the request-capacity capability states: each process sizes its own pool from the
database's `max_connections` and the pool count, so a replica count change SHALL set `DATABASE_POOL_COUNT` to the new
number of processes that can hold a pool at once, and nothing else. The worker needs no coordination beyond Temporal's
own: each activity is handed to one worker, so a second worker replica is safe as it is. The api holds no per-process
limit or cache: every limit counts in Redis, the section order and the other short-lived caches read through Redis, and
the memory the api keeps is a fallback for a Redis outage alone.

#### Scenario: A second worker scans

- **WHEN** the worker runs as two replicas and the sweep dispatches twenty Scans
- **THEN** each Scan runs on exactly one replica, and the two replicas run up to the sum of their concurrency at once

#### Scenario: A second api serves

- **WHEN** the api runs as two replicas behind the platform's load balancer
- **THEN** a user's requests may reach either, and every limit, count, and session reads the same on both

#### Scenario: A third api replica sets the pool count

- **WHEN** the api's replica count goes from two to three
- **THEN** `DATABASE_POOL_COUNT` goes from 8 to 9, and every process's next start sizes its pool from that
