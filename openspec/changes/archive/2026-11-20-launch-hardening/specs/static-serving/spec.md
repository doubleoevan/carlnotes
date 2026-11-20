## RENAMED Requirements

- FROM: `### Requirement: The app service serves the api and the ui from one process`
- TO: `### Requirement: The app service and the web service each serve the api and the ui`

## MODIFIED Requirements

### Requirement: The app service and the web service each serve the api and the ui

The one build image SHALL start two services from the api's own entry: the `app` service and the `web` service, which
starts the same entry under the process name `web`. Each service SHALL serve both the api and the ui from one process,
so one container of either serves the whole app, and routing a path from one service to the other changes nothing about
its response. Every rule this capability states for the api SHALL hold for both services. Which service answers a path
on the public domain is set by path routing, as the deploy-mechanics capability states. The ui's built assets SHALL be
served with the content type implied by their extension, and its pages SHALL be served by the ui's own server handler,
mounted inside the api's server as the fallback for every GET the api does not claim. Each replica of either service
SHALL keep its own render concurrency limit, and the page rate limits SHALL count in Redis across both services.

#### Scenario: An asset is served from the bundle

- **WHEN** a request arrives for a file that exists in the bundle, such as `/assets/index-C3Cn5oAz.js`
- **THEN** the service that receives it responds 200 with that file's bytes and a JavaScript content type

#### Scenario: The site root serves a rendered page

- **WHEN** a request arrives for `/`
- **THEN** the service that receives it responds 200 with that page rendered

#### Scenario: The app service still serves every path

- **WHEN** the public domain's base path is routed back to the `app` service
- **THEN** every page, document, feed, and image responds as it did from the `web` service

#### Scenario: A render burst leaves the chat stream alone

- **WHEN** fifty page renders arrive at once at the `web` service while a chat stream is open on the `app` service
- **THEN** the `app` service's event loop p99 for the minute stays under its 100 ms warning threshold
