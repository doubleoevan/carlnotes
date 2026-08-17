## MODIFIED Requirements

### Requirement: Survivors are fetched by the path their kind selects, with a snippet fallback

For each embed-filter survivor that reaches the fetch stage and is neither reused nor revalidated (see the reuse-and-revalidation requirement), curation SHALL fill the Resource's content by the path its kind and url select, write the fetched text to object storage, store its `content_key` and `content_bytes` on the Resource, refresh `resources.fetched_at`, persist any origin `etag`/`last_modified` the fetch exposes (leaving them null when it does not), and count the outcome as `fetched`. It SHALL score the in-memory text in the same pass so the fetch does not round-trip through object storage.

The paths that fill content, checked in this order:

- **Declared transcript (free).** A Resource whose Source declared a transcript address in `resources.transcript_url` — a podcast feed's `<podcast:transcript>` today — SHALL be filled from that address whatever its kind: a plain bounded GET straight to the origin, every redirect hop checked, read down to its words by the same cue reader the caption tracks use, charging zero. A transcript address exposes no validators of the page's own, so `etag` and `last_modified` stay null and a stale one refetches rather than revalidates.
- **Show notes (no fetch).** A `listen` Resource with no declared transcript SHALL NOT be fetched at all: an episode page is a player and its show notes, and the notes are already in the snippet, so curation scores the snippet and spends nothing.
- **Firecrawl (billed).** Every other Resource except a video on a supported caption host SHALL be fetched as page markdown via Firecrawl (raw HTTP, `FIRECRAWL_API_KEY`), charging the Firecrawl per-fetch rate. This includes a `watch` Resource on any host with no readable captions — Loom, TED, TikTok — because only the hosts below publish a caption track the transcript path can read.
- **Caption track (free).** A `watch` Resource whose url parses to a video id on a host that publishes captions keylessly SHALL instead be filled from that video's published caption track: ask the host for the video's track list, prefer the first track whose language code begins with `en` and otherwise the first published one, fetch it, and join it into plain text. These paths go straight to the host, spend no vendor credit, and SHALL charge zero. The supported hosts are:

  - **YouTube** — the player endpoint lists the tracks, which are served as `json3`. The list SHALL be requested as a mobile client, because the caption urls the web client hands out are gated and serve an empty body.
  - **Vimeo** — the player config lists the tracks, which are served as WEBVTT. A video whose owner restricted embedding answers `403`, which is a failed fetch like any other.
  - **Dailymotion** — the player metadata lists the tracks, which are served as SRT.

  A host SHALL be added only on evidence that its captions can actually be read without a key, not on the presence of a caption feature. A url on a `watch` host with no supported caption path SHALL take the Firecrawl path unchanged.

  Because a caption url comes back inside a remote payload rather than being composed by curation, it SHALL be fetched only when it is an `https` url within the host's own caption domain. A domain check is the property that matters, since these hosts serve captions from their own separate caption hosts and cdn shards rather than from one fixed endpoint.

  A caption response SHALL be judged empty by its joined text rather than by its status, because a gated caption url answers `200` with a zero-byte body rather than an error.

  Caption lines SHALL join on a space and the segments within a line SHALL join directly. A line ends without trailing whitespace, so joining every segment directly runs each line's last word into the next line's first.

Kind alone SHALL NOT select a caption path: a `watch` Resource on an unsupported host has no caption track to read, and sending it down that path would fail a fetch that Firecrawl serves. A declared `transcript_url` outranks every kind-based rule, and `listen` is the one kind that selects on its own — to no fetch at all, never to a paid one.

Each fetch SHALL report the dollars it spent, and curation SHALL charge that amount to the `fetch` entry of the Scan's stage costs. A transcript therefore meters into the same entry as a scrape rather than earning one of its own, and leaves that entry unchanged because it costs nothing. Every path counts its outcome as `fetched` — the show-notes path too, since scoring is paid whichever way the content arrived — so a transcribed video or a snippet-scored episode counts against the Scan's scored-resource ceiling like any other scored Resource.

A video with no published caption track, an unreadable player payload, or a transcript that joins to nothing SHALL be treated as a failed fetch. On a fetch failure of any path, curation SHALL fall back to the Resource's native snippet — never the bare title — as the text to score, leaving `content_key` null. On an object-storage write failure it SHALL best-effort delete the object, leave `content_key` null, and fall back to the snippet, mirroring the attachment orphan-cleanup posture. Neither failure SHALL fail the Resource or the Scan.

#### Scenario: Content is fetched and stored

- **WHEN** a survivor is fetched successfully by either path
- **THEN** the fetched text is written to object storage, the Resource stores its `content_key` and `content_bytes`, `fetched_at` is refreshed, the outcome is counted as `fetched`, and scoring runs against the in-memory text without re-reading it from object storage

#### Scenario: A video on a supported host is scored on its transcript

- **WHEN** a `watch` survivor's url carries a video id on YouTube, Vimeo, or Dailymotion and the video publishes a caption track
- **THEN** curation fetches that caption track instead of calling Firecrawl, joins it into plain text, and scores the transcript rather than the video's description

#### Scenario: Each host's own payload shape yields the same track list

- **WHEN** curation reads a track list from YouTube's player endpoint, Vimeo's player config, or Dailymotion's player metadata
- **THEN** each maps to the same track shape of a language code and a url, so one preference rule and one fetch serve all three

#### Scenario: An English track is preferred over the other published ones

- **WHEN** a video publishes caption tracks in several languages, listed in the host's own order so English is not first
- **THEN** curation picks the first track whose language code begins with `en`, and falls back to the first published track when there is none

#### Scenario: Both caption file formats read down to their words

- **WHEN** a track arrives as WEBVTT with a header and numbered cues, or as SRT with comma-punctuated timestamps
- **THEN** the cue numbers, timing lines, notes, and inline markup are dropped and only the spoken words are kept

#### Scenario: Caption lines do not run their words together

- **WHEN** one caption line ends with a word and the next begins with another
- **THEN** the joined transcript keeps them as two words rather than fusing them into one

#### Scenario: A video with no captions scores its snippet

- **WHEN** a `watch` survivor is on a supported host but publishes no caption track, or its owner restricted access to the track list
- **THEN** its content is left unset, `content_key` stays null, and it is scored on its native snippet exactly as a failed scrape is

#### Scenario: Every way a host addresses a video takes the transcript path

- **WHEN** a `watch` survivor's url is a YouTube watch page, short link, short, embed, or live replay; a Vimeo plain, channel, group, or player link; or a Dailymotion video url or `dai.ly` short link
- **THEN** curation reads the video id out of it and fetches its caption track, rather than treating only the canonical form as a video

#### Scenario: A video on an unsupported host keeps the Firecrawl path

- **WHEN** a `watch` survivor's url is on Loom, TED, TikTok, Rumble, or any other host with no supported caption path
- **THEN** curation fetches it via Firecrawl and charges the Firecrawl per-fetch rate, unchanged from today

#### Scenario: A transcript meters into the fetch entry without growing it

- **WHEN** a Scan fills a video's content from its caption track
- **THEN** the fetch charges zero into `stage_costs.fetch` — no other entry — and the outcome still counts as `fetched` against the scored-resource ceiling

#### Scenario: A caption url outside the host's own domain is not fetched

- **WHEN** a track list names a url that is not `https` or that points outside the host's caption domain
- **THEN** curation does not fetch it, the transcript fetch fails, and the Resource is scored on its snippet

#### Scenario: Fetch validators are persisted when exposed

- **WHEN** the fetch response exposes an origin `etag` or `last_modified`
- **THEN** curation stores them on the Resource so a later Scan can send a conditional GET, and leaves them null when the response exposes neither

#### Scenario: Fetch failure falls back to the snippet

- **WHEN** the fetch for a survivor fails on either path
- **THEN** scoring runs against the Resource's native snippet, `content_key` stays null, and the Resource is not failed

#### Scenario: An object-storage write failure falls back to the snippet

- **WHEN** the object-storage write for a fetched survivor fails
- **THEN** curation best-effort deletes the object, leaves `content_key` null, scores the snippet, and does not fail the Resource or the Scan
