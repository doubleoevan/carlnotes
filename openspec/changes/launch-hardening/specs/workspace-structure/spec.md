## MODIFIED Requirements

### Requirement: Every Northflank process starts through a stable root script

Every process Northflank starts SHALL have a root script that keeps its name across the move: `temporal` for the
Temporal worker, `schedule` for the scan sweep, `reset:monthly-budgets` for the budget reset, `db:migrate` for the
migrate job, `edge:purge` for the edge purge, and `docs:embed` for the docs embed, each running the process under
`doppler run`. The `web` service SHALL start through the root script `web`, which starts the api's entry under the
process name `web`. The worker's two roles SHALL start through the root scripts `temporal:main` and `temporal:films`,
which set `WORKER_ROLE` in the command after `doppler run --`, because a Doppler value would override one set on the
service. Every existing root script SHALL keep its name, and every GitHub Actions job SHALL keep its name. The
Dockerfile's `CMD` SHALL keep starting the api under `doppler run`.

#### Scenario: The scripts survive the move

- **WHEN** the move ships and each Northflank process starts by its root script
- **THEN** every process starts without a command change in Northflank

#### Scenario: The web service and the worker roles start by script

- **WHEN** Northflank starts the `web` service with `bun run web`, the main worker with `bun run temporal:main`, and
  the film service with `bun run temporal:films`
- **THEN** the first starts the api's entry as `web`, the other two start the worker in their roles, and
  `bun run temporal` still starts a worker that hosts every Worker
