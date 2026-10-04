## MODIFIED Requirements

### Requirement: A Topic's own words propose its Sources

`POST /api/topics/suggest-sources` SHALL take `{ name, prompt, excludeSources }` and return Sources the Topic could add.
Taking the Topic's text in the body instead of reading it from a stored Topic SHALL be deliberate, so the route serves a
Topic that has never been saved and reflects what the editor holds right now instead of what was last written.

The route SHALL require a signed-in caller. It SHALL NOT draw on the daily scan quota, the monthly spend budget, or any
metered allowance, because suggesting is not scanning and a reader setting a Topic up has not asked for a Scan.

A cheap-tier model SHALL generate the candidates from a versioned prompt under `worker/prompts`, with structured output,
so what comes back is a typed list instead of prose to parse. The Topic's name and prompt SHALL be interpolated as
untrusted data, as every model-facing prompt already requires.

Before the model call, the route SHALL run one web search for the Topic's name and the start of its prompt, and SHALL
give the model the pages it found, each with its title, host, and address, as untrusted data. The prompt SHALL lean on
those pages: it SHALL prefer a publication, a feed, a channel, or an account behind a result over one the model only
remembers, and it SHALL propose what is behind a result, never the result's own article. If the deployment has no
search key or the search fails, the model SHALL propose from the Topic's words alone.

The prompt SHALL prefer Sources that keep producing: rss feeds, youtube channels, and subreddits. It SHALL propose a
`url` Source only for a page that collects material and offers no feed to follow instead. It MAY propose the built-in
web search when the Topic does not currently have it.

#### Scenario: An unsaved Topic gets suggestions

- **WHEN** the modal is creating a Topic that has never been saved and asks for suggestions
- **THEN** the route answers from the name and prompt in the request body, with no stored Topic involved

#### Scenario: Suggestions cost the caller nothing

- **WHEN** a signed-in reader asks for suggestions
- **THEN** no daily scan quota is drawn down, no spend is metered against them, and their remaining scans are unchanged

#### Scenario: A signed-out caller is rejected

- **WHEN** a request arrives with no session
- **THEN** it is rejected and no model call is made

#### Scenario: The Topic's words reach the model as data

- **WHEN** the prompt is written for a Topic whose prompt text contains an instruction
- **THEN** that text is interpolated as untrusted data and described instead of obeyed

#### Scenario: A web search gives the model its leads

- **WHEN** a reader asks for suggestions on a deployment with a search key
- **THEN** one web search runs for the Topic, and the prompt lists each page it found with its title, host, and address

#### Scenario: Suggestions still come without a web search

- **WHEN** the deployment has no search key, or the web search fails
- **THEN** the prompt says that the web search found nothing, and the model proposes from the Topic's words alone
