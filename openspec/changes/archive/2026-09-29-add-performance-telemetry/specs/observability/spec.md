## ADDED Requirements

### Requirement: Model calls reach Langfuse beside Sentry

Every model call the api or the worker makes SHALL reach Langfuse when its keys are set, whether or not Sentry is running in the same process, and whatever Sentry samples. Langfuse SHALL record every model call, including one made inside a request Sentry did not sample. Langfuse's spans SHALL NOT be sent to Sentry, Sentry SHALL NOT record model calls of its own, and a Sentry span SHALL NOT be parented to a span Sentry never records. Without Sentry, Langfuse SHALL trace as it did, with a Scan's stages and model calls nested in one trace. The api and the worker SHALL start Sentry before Langfuse, so each process makes the same choice.

#### Scenario: A chat reply in the api reaches Langfuse

- **WHEN** a signed-in user asks Carl a question in production, where Sentry and Langfuse are both running
- **THEN** the reply's model calls appear in Langfuse with their usage and cost, and they do not appear as spans in Sentry

#### Scenario: An unsampled request's model calls are still recorded

- **WHEN** Sentry's sampler leaves a chat request untraced
- **THEN** Langfuse still records every model call the request made

#### Scenario: A Scan still traces as one trace

- **WHEN** a Scan runs in the worker with Sentry running
- **THEN** Langfuse shows one trace for the Scan, with each stage's span and its model calls nested under it

#### Scenario: Without Sentry nothing changes

- **WHEN** Langfuse's keys are set and Sentry's are not, as in dev
- **THEN** model calls and Scan stages reach Langfuse exactly as before
