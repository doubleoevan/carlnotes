## MODIFIED Requirements

### Requirement: YouTube ingester finds canonical Resources

`youtubeIngester` SHALL read a YouTube channel id or playlist id from the Source's `config` and find one Resource per
video, `kind` `watch`, cost `0`, deduped by canonical URL, using `https://www.youtube.com/watch?v=<videoId>` as the
canonical URL. When `YOUTUBE_API_KEY` is set, it SHALL fetch recent videos via the Data API v3 (the YouTube channel's
uploads playlist) and leave `fallbackMode` unset. When the key is absent, it SHALL fall back to the keyless YouTube
channel/playlist Atom feed and set `fallbackMode` to `youtube-atom`. When the Data API responds to the playlist read
with 404 or 400, as it does for an auto-generated YouTube Topic channel, it SHALL read the Atom feed the same way. When
the Atom feed responds with 404 or 400 too, it SHALL mark the Source `failed` with a reason its owner reads, so the
Source stops reading ready. A quota error, a rejected key, a server error, a timeout, or a feed 404 without a key SHALL
fail only that Scan's read and leave the Source ready. Both modes SHALL find the same canonical URL for the same video.
It SHALL require no Integration (`integration_id` may be null).

#### Scenario: API mode when the key is present

- **WHEN** `YOUTUBE_API_KEY` is set and a Source of kind `youtube` is scanned
- **THEN** `youtubeIngester` fetches videos via the Data API, finds one `watch` Resource per video keyed by its
  `watch?v=` URL, and leaves `fallbackMode` unset

#### Scenario: Keyless Atom fallback when the key is absent

- **WHEN** `YOUTUBE_API_KEY` is missing and a Source of kind `youtube` is scanned
- **THEN** `youtubeIngester` fetches the YouTube channel/playlist Atom feed, finds `watch` Resources, and sets
  `fallbackMode` to `youtube-atom`

#### Scenario: Canonical URL is stable across modes

- **WHEN** the same video is found once by the API path and once by the Atom fallback
- **THEN** both find the same `https://www.youtube.com/watch?v=<videoId>` URL, so it dedupes to a single Resource

#### Scenario: A playlist the API does not serve is read from the feed

- **WHEN** the Data API responds to a YouTube Topic channel's uploads playlist with 404
- **THEN** `youtubeIngester` reads the YouTube channel's Atom feed and sets `fallbackMode` to `youtube-atom`

#### Scenario: A missing YouTube channel is failed on its row

- **WHEN** both the Data API and the Atom feed respond with 404
- **THEN** the Source is marked `failed` with the reason, and later Scans skip it

#### Scenario: A quota error leaves the Source ready

- **WHEN** the Data API responds with 403 for a spent quota, or 400 for a rejected key
- **THEN** that Scan's read fails, no feed is read, and the Source stays ready

#### Scenario: A feed miss without the API leaves the Source ready

- **WHEN** no API key is set and the Atom feed responds with 404
- **THEN** that Scan's read fails and the Source stays ready, because the feed alone sometimes misses a YouTube channel
  that exists
