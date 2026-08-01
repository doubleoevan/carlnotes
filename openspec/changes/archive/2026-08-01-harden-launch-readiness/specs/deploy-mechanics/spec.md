## ADDED Requirements

### Requirement: The scanner runs as its own service reachable by the app and the worker

The LLM Guard scanner SHALL be deployed as its own container service on the platform, addressed by the app and the worker through one configured url rather than embedded in the app image, since it is a Python service and the app runtime is Bun. The local development stack SHALL be able to run the same image, so a scanner-dependent path can be exercised without deploying. Its url SHALL be optional: unset means scanning is off and every path behaves as an unscanned build.

#### Scenario: The app reaches the scanner by url

- **WHEN** the scanner service is deployed and its url is configured
- **THEN** the app and the worker scan through that url, and no scanner code runs inside the app image

#### Scenario: The stack runs without the scanner

- **WHEN** the scanner url is unset, as in a self-hosted deployment
- **THEN** every service starts and runs normally with scanning disabled

### Requirement: An external monitor polls the liveness route

Availability SHALL be watched from outside the deployment by a monitor that polls the public `/api/health` route and alerts on failure, rather than by any in-app scheduler. The route SHALL remain unauthenticated and database-free, so what the monitor measures is process reachability.

#### Scenario: An unreachable app alerts

- **WHEN** the deployed app stops answering `/api/health`
- **THEN** the external monitor alerts, with no in-app job responsible for noticing
