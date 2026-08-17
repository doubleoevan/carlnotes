## MODIFIED Requirements

### Requirement: A right-rail info card summarizes the Topic
Beside the History list (top-aligned with it, not with Findings), a single info card SHALL show, separated by thin dashed rules: Carl's Notes (the latest succeeded Scan's recap, when one exists); Carl's Prompt; Sources; Attachments as links where a url opens its page and a file downloads for the owner only; Schedule as the frequency, a muted "last scan" age, and how long that scan took; Visibility with its glyph (🔒 private, 🌐 public, ✉ invite); and, for the owner or an admin, this calendar month's total scan spend. The Sources section SHALL lead with the default sources — one line per default source kind, each labeled with its own copy and shown as on or muted off, currently Carl's built-in web scout (the search Source, whose ingester derives queries from the topic prompt) labeled `web` — followed by one line per custom Source with a type glyph, its kind, and a config summary (feed host, subreddit, channel/playlist id, or the `@handle` of a Bluesky account).

Carl's Notes, and the same recap wherever the scan-history and activity drill-downs render it, SHALL render through the sanitized markdown subset `injection-defense` requires: bold, lists, and headings render, a citation of a kept Finding's stored url renders as a real link, and every other link, image, or piece of raw HTML is neutralized into inert text — because a model wrote it from attacker-reachable content. A recap citing an item pruned since (or shown on a surface without the findings in hand, like the Activity drill-down) renders that citation inert rather than guessing.

#### Scenario: The info card renders every section
- **WHEN** the owner views a Topic with sources and a finished Scan
- **THEN** the card shows Carl's notes, the prompt, one line per default source plus per-custom-source kind + summary lines, the schedule with its last-scan age and duration, and the visibility glyph

#### Scenario: A topic missing a default source shows it as off
- **WHEN** the user views a Topic that has no search Source
- **THEN** the Sources section still leads with that default line, muted and marked off

#### Scenario: A Bluesky account source shows its handle
- **WHEN** the user views a Topic with a bluesky Source
- **THEN** that custom source line summarizes it as the account's `@handle`

#### Scenario: Carl's notes link only to kept findings
- **WHEN** the latest Scan's recap cites a kept Finding's url and also contains a link elsewhere or HTML syntax
- **THEN** the kept citation renders as a real link, everything else shows as inert text with no clickable link and no embedded markup, and the recap's bold and lists still render

#### Scenario: A topic without a search source shows the web search as off
- **WHEN** the user views a Topic that has no search Source
- **THEN** the Sources section still leads with the web search line, muted and marked off

#### Scenario: A topic without a search source shows the scout as off
- **WHEN** the user views a Topic that has no search Source
- **THEN** the Sources section still leads with the web scout line, muted and marked off

#### Scenario: A Google News source reads as its publisher
- **WHEN** the user views a Topic holding a Google News Source
- **THEN** it is listed among the custom Sources summarized by the publisher it covers, not by `news.google.com`
