## Why

The first runs of the new evals found prompt and code problems that users meet. The podcast outline often wrote junk in
place of a Finding's number, so its drafts were rejected and written again, and some episodes lost a chapter. A thin
episode was planned three times longer than its Findings could fill. The source suggester proposed shops as news
publishers, wrote a source's kind into its value, named YouTube channels by display name, and matched a podcast name to
whatever show iTunes returned first. The scan report pasted raw status codes and described pages it only had counts
for. The new-topic chat praised the reader's idea before answering.

## What Changes

- The podcast outline and segment calls name each chapter's Finding by an integer field, so a draft cannot put other text
  where the number goes, and a segment's prompt says its numbering starts at 1 in every segment.
- The outline prompt sets a chapter's length by how much its Finding has to say, so thin Findings make a short episode,
  and counts the description's fixed opening toward its word limit. The segment prompt forbids working out a new number
  from the content's numbers.
- The source suggester:
  - resolves an rss suggestion that is a page to the feed its head advertises, and reads a bare domain over https
  - names a Google News suggestion by its bare domain
  - strips a source's option written in front of its value, as in `x:cycling`
  - keeps a podcast suggestion only if iTunes finds a show of that name
  - asks the model for five more suggestions than the open slots
  - and its prompt says to prefer sources specific to the topic, to skip shops and code hosts, never to treat a hosting
    platform as a publisher, and to write a YouTube channel by its handle
- The scan report prompt forbids repeating a failed source's status code, describing a filtered page, comparing with
  earlier scans, and a vague word for a count.
- The new-topic chat prompt forbids praise for the reader's idea or reply, and builds the topic's prompt only from what
  the reader said.
- The goodbye's first fixed line becomes "Well, I've got more reading to do.", and a segment check rejects a sign-off or a
  goodbye that repeats a fixed line, while the last draft's repair drops the repeated turn.
- The segment prompt says its numbers start at 1 and that an unlisted number names no finding. The scan report prompt
  names a list limit only if the topic's own text sets one, and links every kept finding. The suggester's prompt tests each source for being mostly
  about the topic, and gives no example value that the model can copy as a suggestion.

## Capabilities

### New Capabilities

### Modified Capabilities

- `podcast-episode-rendering`: a draft names each chapter's Finding in an integer field, and a sign-off or a goodbye
  never repeats the goodbye's fixed lines
- `source-suggestion`: an rss suggestion resolves to its advertised feed, a url or a feed without a scheme is read over
  https, a Google News suggestion is named by its bare domain, an option prefix is stripped, a podcast must match its
  name, and a Google News source is only a news publisher

## Impact

- `worker/podcast/podcastEpisodeScript.ts` and `generatePodcastEpisodeScript.ts`: the draft payloads and the mapping of a
  number to its Finding's id.
- `worker/suggest.ts`: resolution, the headroom, and `toSourceSuggestions` with its counts.
- Prompts: `outline-podcast-episode.md` (version 3), `write-podcast-episode-segment.md` (version 4),
  `suggest-sources.md` (version 5), `summarize-topic-scan.md` (version 10), and `chat-new-topic.md` (version 12). The
  prompt registry needs `prompts:sync:prd` after the deploy.
- No schema change and no migration. A stored outline keeps Finding ids, since the numbers map back before anything is
  saved.
