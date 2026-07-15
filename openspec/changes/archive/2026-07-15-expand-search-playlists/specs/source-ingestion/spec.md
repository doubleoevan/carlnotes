## ADDED Requirements

### Requirement: Search adapter expands YouTube playlist results into videos

When a search result's URL is a YouTube playlist (`youtube.com/playlist?list=<id>`), `searchAdapter` SHALL expand it into the playlist's member videos rather than emit the playlist page as a single Resource. Expansion SHALL reuse the YouTube adapter's `playlistItems` Data API path (`YOUTUBE_API_KEY`) and its video-to-Resource mapping, so each member video becomes a `watch` Resource keyed by its canonical `https://www.youtube.com/watch?v=<id>` URL — the same key the `youtube` Source emits, so the two dedupe. Non-playlist results SHALL be unchanged (they remain `read` Resources keyed by their URL). Expansion SHALL run on every scan within the search flow, requiring no new Source kind, schema, or scheduler.

#### Scenario: A playlist result is expanded into its videos

- **WHEN** a search result's URL is `youtube.com/playlist?list=<id>` and `YOUTUBE_API_KEY` is set
- **THEN** the adapter fetches the playlist's items via `playlistItems` and emits one `watch` Resource per video (keyed by its `watch?v=` URL), and the playlist URL itself is not emitted as a Resource

#### Scenario: Non-playlist results are untouched

- **WHEN** a search result's URL is not a YouTube playlist URL
- **THEN** it lands as a `read` Resource keyed by its own URL, exactly as before

#### Scenario: Expanded videos dedupe against YouTube Sources

- **WHEN** an expanded playlist video resolves to the same canonical `watch?v=` URL as a video from a `youtube` Source in the same Scan
- **THEN** only one Resource is stored for that URL

#### Scenario: Missing key keeps the opaque link

- **WHEN** a search result is a playlist URL but `YOUTUBE_API_KEY` is absent
- **THEN** the playlist stays a single `read` Resource (no expansion) and the search Source does not fail

#### Scenario: One playlist's expansion failure is isolated

- **WHEN** expanding one playlist errors (private, 404, or timeout)
- **THEN** that playlist's original `read` Resource is kept and the Scan's other search results and playlist expansions are unaffected
