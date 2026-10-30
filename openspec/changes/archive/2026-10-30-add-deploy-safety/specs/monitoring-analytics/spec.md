## MODIFIED Requirements

### Requirement: An external uptime monitor pings the public health endpoint

An uptime monitor outside the deployment SHALL poll the public `/api/health/ready` endpoint and alert on failure. The
endpoint SHALL stay reachable without a session and without a database read, so the monitor measures whether the
process can render a page, not only whether it runs.

#### Scenario: A down instance alerts

- **WHEN** the app stops answering `/api/health/ready`
- **THEN** the external monitor alerts, without any in-app scheduling or state

#### Scenario: A server that runs but cannot render alerts

- **WHEN** `/api/health` responds 200 and `/api/health/ready` responds 503
- **THEN** the external monitor alerts

## ADDED Requirements

### Requirement: A Sentry uptime monitor watches the home page

A Sentry uptime monitor SHALL request `https://carlnotes.com/` and alert if it does not respond 200, so a failure
between the edge and the page, which the readiness route cannot see, still alerts. The README SHALL list how to set it
up as a manual step.

#### Scenario: A home page error alerts

- **WHEN** `https://carlnotes.com/` responds 503 while `/api/health/ready` responds 200
- **THEN** the Sentry uptime monitor alerts

### Requirement: Sentry events name the deployed commit as their release

Sentry events from the api and the worker SHALL include the deployed commit's SHA as their release, so an alert names
the commit that introduced an issue. If the process cannot read a commit SHA, it SHALL send events with no release
instead of a made-up one.

#### Scenario: An error names its commit

- **WHEN** the deployed api reports an error
- **THEN** the Sentry event's release is the SHA of the commit that the release run built

### Requirement: A page render that fails is reported to Sentry

A web server render that returns a 5xx status, other than the render limit's busy response and the degraded render
the api already reports, SHALL be reported to Sentry in the `page-render` stage with its path, under the existing
ten-an-hour limit. A render that throws SHALL keep its existing report.

#### Scenario: A 500 page is reported

- **WHEN** the web server build renders a topic page and returns a 500 response without throwing
- **THEN** a Sentry event in the `page-render` stage names the path, and the visitor receives the 500 page

### Requirement: Deploy alerts notify by email and push

The README SHALL list the manual alert setup as current state: a Sentry alert for a new issue in a release, a Sentry
alert for an error rate spike, the external monitor on `/api/health/ready`, and the Sentry uptime monitor on the home
page. Each SHALL notify the owner by email and by push to the Sentry mobile app, or the monitor's own app for the
external monitor.

#### Scenario: A new issue after a release notifies the owner

- **WHEN** a release introduces an error that Sentry has not seen before
- **THEN** the owner receives an email and a push notification naming the issue and its release
