## MODIFIED Requirements

### Requirement: The app service serves the api and the ui from one process

The one build image SHALL start two services. The `web` service, `apps/web`'s server, SHALL serve the pages the ui's
server handler renders, the blog and release pages, the built docs, the documents, the feeds, the podcast feeds, the
share and cover images, the avatars, the favicons, and the ui's built client files. The `app` service, `apps/api`,
SHALL serve `/api`, `/mcp`, the oauth well-known routes, and every stream, and SHALL keep serving every path the web
service serves, so routing a path from one service to the other changes nothing about its response. The page routes
SHALL live in one server package that both services mount, and the ui's built assets SHALL be served with the content
type implied by their extension, with the ui's server handler mounted as the fallback for every GET neither service
claims otherwise. Each service SHALL keep its own render concurrency limit and page rate limits, counted in Redis as
today.

#### Scenario: An asset is served from the bundle

- **WHEN** a request arrives for a file that exists in the bundle, such as `/assets/index-C3Cn5oAz.js`
- **THEN** the web service responds 200 with that file's bytes and a JavaScript content type

#### Scenario: The site root serves a rendered page

- **WHEN** a request arrives for `/`
- **THEN** the web service responds 200 with that page rendered

#### Scenario: The api service still serves every path

- **WHEN** the base path routes back to the `app` service
- **THEN** every page, document, feed, and image responds as it did from the web service, byte for byte apart from
  hashed asset names

#### Scenario: A render burst leaves the chat stream alone

- **WHEN** fifty page renders arrive at once at the web service while a chat stream is open on the api service
- **THEN** the api service's event loop p99 for the minute stays under its 100 ms warning threshold
