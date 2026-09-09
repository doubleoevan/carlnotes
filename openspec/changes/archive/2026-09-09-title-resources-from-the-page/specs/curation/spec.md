## ADDED Requirements

### Requirement: A fetched page's own title replaces a title read off the url

A Resource discovered as a link carries no title of its own, so ingestion's derive-a-title rule falls back to the url's last path segment, which names a page only when its url happens to. A sha, an id, or a bare directory name renders as a Finding that names nothing.

When a Resource is fetched by the Firecrawl path, the fetch SHALL return the page's own title from the metadata that response already carries — the same metadata the `etag` and `last_modified` are read from — and the fetch SHALL store it on the Resource in the same row update that stores `content_key`, `content_bytes`, and the validators.

The title SHALL be stored only when the Resource's stored title is the one the derive-a-title rule reads from the url alone, compared without case so an anchor word matches the path segment it points at. A title an ingester supplied, and a title the rule read from a native snippet line, SHALL be left as they are: a page's own title is often its site's name rather than the page's, so replacing a title that already names the page would read worse. A Resource with no stored title at all SHALL take the page's title by the same comparison rather than by an exception to it: ingestion leaves a title unset only where the url yields no segment to read either, so both sides are empty and the rule already holds.

The paths that read no page SHALL return no title, and SHALL leave the stored title untouched: a declared transcript, a caption track, and an episode scored on its show notes have no page whose title to read. A fetch that fails SHALL likewise leave the title as it stands, alongside the snippet fallback it already performs.

This SHALL add no fetch and no cost. The title travels in a response the fetch already makes and already parses.

#### Scenario: A commit page retitles a Finding named by its sha

- **WHEN** a survivor whose stored title is its url's last path segment is fetched through Firecrawl and the response's metadata names the page
- **THEN** the Resource's title becomes the page's own title, stored in the same update as its content key, and the Finding renders under that name

#### Scenario: A title that already names the page is kept

- **WHEN** a survivor whose title came from its ingester, or from a line of its own snippet, is fetched and the page names itself something else
- **THEN** the stored title is left as it is

#### Scenario: An anchor word matching its path is treated as read off the url

- **WHEN** a survivor's stored title differs from its url's last path segment only in case
- **THEN** it counts as read off the url and the page's own title replaces it

#### Scenario: A transcript leaves the title alone

- **WHEN** a survivor is filled from a declared transcript, a caption track, or its show notes
- **THEN** no page title is read and the Resource's stored title is unchanged
