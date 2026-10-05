## 1. Podcast episode script

- [x] 1.1 Name each chapter's Finding by an integer `findingNumber` in the outline and segment payloads, map it back to the
  Finding's id, and list each Finding as "finding number" in the prompts
- [x] 1.2 Set a chapter's planned length by how much its Finding has to say, and count the description's opening toward
  its twenty words, in `outline-podcast-episode.md`
- [x] 1.3 Say that a segment's numbering starts at 1 in every segment, and forbid working out a new number from the
  content's numbers, in `write-podcast-episode-segment.md`

## 2. Source suggestions

- [x] 2.1 Strip a value's own option written in front of it, and name a Google News suggestion by its bare domain
- [x] 2.2 Read an rss or url suggestion without a scheme over https, and resolve an rss page to the feed its head
  advertises
- [x] 2.3 Keep a podcast suggestion only if iTunes finds a show of its name that publishes a feed, preferring a show of
  that exact name
- [x] 2.4 Ask for five more suggestions than the open slots, and return the new and readable suggestion counts from
  `toSourceSuggestions`
- [x] 2.5 Tell the prompt to prefer specific sources, skip shops, treat no hosting platform as a publisher, keep Google News
  to news publishers, write a YouTube handle, and write each value without its option
- [x] 2.6 Test the option prefix, the advertised feed link, and the podcast name match

## 3. Scan report and new-topic chat

- [x] 3.1 Forbid a failed source's status code, a description of a filtered page, a comparison with earlier scans, and a
  vague count, in `summarize-topic-scan.md`
- [x] 3.2 Forbid praise for the reader's idea or answer in `chat-new-topic.md`
- [x] 3.3 Run every eval at `--repeat 3` and read every failure

## 4. Second round from the evals

- [x] 4.1 Change the goodbye's first fixed line to "Well, I've got more reading to do.", reject a sign-off or a goodbye
  that repeats a fixed line, drop the repeated turn from the last draft, and test both
- [x] 4.2 Say that a segment's numbers start at 1 and that an unlisted number names no finding
- [x] 4.3 Name a list limit in the scan report only if the topic's own text sets one, link every kept finding, and build the new-topic chat's
  prompt only from what the reader said
- [x] 4.4 Test each suggested source for being mostly about the topic, and drop the suggester prompt's copyable example
  values
- [x] 4.5 Run the changed evals again at `--repeat 3`
