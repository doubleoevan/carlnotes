## ADDED Requirements

### Requirement: The app listens on the configured port

The app service SHALL listen on the port the `PORT` environment variable names, and on 3000 if it is unset, so two api processes can run side by side on one machine and the platform can place a replica on the port it chooses. The server's export SHALL omit a fixed port and let Bun read the variable, and the Dockerfile SHALL keep exposing 3000 as the default.

#### Scenario: Two api processes on one machine

- **WHEN** a developer starts the api twice with `PORT=3000` and `PORT=3001`
- **THEN** both serve, each on its own port, against the same database and Redis

#### Scenario: The default is unchanged

- **WHEN** the api starts with `PORT` unset
- **THEN** it listens on 3000, as the Dockerfile and the Vite proxy expect

### Requirement: The api and the worker run as replicas within the pool rule

The app service and the temporal-worker service SHALL each run as one or more replicas, set in the platform, and the count SHALL respect the pool rule the request-capacity capability states. The worker needs no coordination beyond Temporal's own: each activity is handed to one worker, so a second worker replica is safe as it is. The api needs every per-process limit and cache moved to Redis first, which is what the redis-store capability provides. A replica count SHALL be raised only after the Neon compute's `max_connections` has been read.

#### Scenario: A second worker scans

- **WHEN** the worker runs as two replicas and the sweep dispatches twenty Scans
- **THEN** each Scan runs on exactly one replica, and the two replicas run up to the sum of their concurrency at once

#### Scenario: A second api serves

- **WHEN** the api runs as two replicas behind the platform's load balancer
- **THEN** a user's requests may reach either, and every limit, count, and session reads the same on both

### Requirement: The budget reset runs as its own scheduled job

The monthly budget reset SHALL run as its own script, `bun run reset:monthly-budgets`, on a platform cron once a day shortly after midnight UTC, under its own database claim, the same kind the sweep uses, so an overlapping reset exits without doing the work. It SHALL NOT run inside the scheduled sweep. The README's process table SHALL name the job beside the scheduler.

#### Scenario: The reset runs apart from the sweep

- **WHEN** the reset job and a sweep run in the same minute
- **THEN** the sweep dispatches its Scans without waiting for a single key to be replaced, and the reset replaces keys without a sweep in its process

#### Scenario: A second reset exits

- **WHEN** a reset starts while another reset holds the claim
- **THEN** the second exits at once having replaced nothing
