## MODIFIED Requirements

### Requirement: The script is written from each Finding's summary, relevance, and stored content

A script writer on `score-model`, through LiteLLM on the billed user's virtual key, SHALL write the Podcast Episode from
the picked Findings and the Topic's name and prompt. It SHALL never be given context derived from the Topic's
attachments. An attachment stays its owner's alone, and a Podcast Episode reaches every subscriber and, on a public
Topic, the open web through its feed and its transcript. For each Finding it SHALL be given the title, the summary, the
relevance explanation, and the Finding's stored Resource content. Each chapter SHALL be built on the summary and the
relevance explanation, and the stored content SHALL supply the specifics, such as names, numbers, and quotes. The
content SHALL be read from storage the way the chat's retrieval reads it, and nothing SHALL be fetched from the web at
render time. Each Finding's content SHALL be limited to about 1,500 words. The writer SHALL paraphrase what a source
says. It MAY quote a source directly at most three times per Finding, each in one short sentence, and SHALL name the
source if it does. Its prompts SHALL live as markdown under `worker/prompts/`, and every untrusted value, the stored
content included, SHALL reach the model inside the per-call nonce delimiters. The writer SHALL work from one outline. A
first call groups the Findings into a few themed segments, orders them, and gives each chapter a length, and then one
call per segment writes that segment's turns against the outline.

Both hosts SHALL be described in one prompt fragment, `podcast-episode-hosts.md`, that both prompt templates splice. The
fragment SHALL tell them that they host Coffee Break, the carlnotes.com podcast, and that they may name the show or the
site now and then, never as a pitch. It SHALL give them Carl's backstory from the homepage hero, which may color a line
or a joke now and then while each episode stays on the topic. The hosts SHALL call the person each episode is for
the topic follower, never the reader:

- **Carl**, the host: confident, specific, a little too informed, never smug or salesy, delighted you asked. Short
  declaratives, rhythm over adjectives. He reports findings like a friend who can't help himself, not a dashboard. He
  never guilt-trips, never says "you missed", and never asks you to come back.
- **Vienna**, Carl's co-host: very curious, warm, quick, and easy to delight. She asks what
  the listener would and always wants the next detail. She wants things clear, and asks Carl to say a vague point
  plainly. She is opinionated but not negative, and she can disagree with Carl and say why. She is not a skeptic: she
  takes a finding in good faith and never waves one off. Short questions, real follow-ups, and she won't let a chapter
  end until it lands on why it matters.

Every chapter SHALL therefore end on its Finding's relevance explanation. Now and then one host SHALL call the other by
name, once or twice in a segment at most. The writer's sign-off SHALL close on what the episode added up to. Every
Podcast Episode SHALL then have Carl say he has more reading to do and Vienna say he always does, two lines added after
the sign-off with each given to its host, and SHALL end on a short goodbye that the writer adds after them in the hosts'
own words, unscripted and different every episode. The writer SHALL never write the two fixed lines itself. The hosts' names SHALL appear in copy only: the prompts, the UI,
the feeds, and the transcript. They SHALL never appear in the schema or in identifiers.

#### Scenario: The writer gets the stored content

- **WHEN** the script prompts are built for a Podcast Episode
- **THEN** their inputs include each Finding's title, summary, relevance explanation, and stored content, and the
  Topic's name and prompt

#### Scenario: Attachment context never reaches the writer

- **GIVEN** a Topic whose owner uploaded an attachment that Scans read as context
- **WHEN** the script prompts are built for one of its Podcast Episodes
- **THEN** no text from the attachment or from its distilled context is in either prompt

#### Scenario: Nothing is fetched at render time

- **WHEN** a Podcast Episode's script is written
- **THEN** each Finding's content comes from storage, and no request is made to the Finding's source

#### Scenario: Long content is limited

- **WHEN** a Finding's stored content runs to 6,000 words
- **THEN** about its first 1,500 words reach the prompt

#### Scenario: A Finding with no stored content still gets a chapter

- **WHEN** a Finding's Resource has no stored content
- **THEN** its chapter is written from its summary, which is the Resource's snippet, and its relevance explanation

#### Scenario: A source is paraphrased, with three short quotes at most

- **WHEN** a chapter is written for a Finding whose stored content has several quotable passages
- **THEN** the chapter says what the source says in the hosts' own words, quotes at most three sentences of it, and
  names the source of each

#### Scenario: Untrusted values are fenced

- **WHEN** a script prompt is built
- **THEN** every Finding's text, its stored content included, and the Topic's name and prompt sit inside that call's
  nonce delimiters, and the task is restated after them

#### Scenario: One outline, then one call per segment

- **WHEN** a Podcast Episode with three segments is written
- **THEN** one outline call is made, then three segment calls, each given the outline

#### Scenario: A chapter ends on why the Finding matters

- **WHEN** a chapter is written for a Finding
- **THEN** its last turns state the Finding's relevance to the topic follower

#### Scenario: Both hosts are described in the prompts

- **WHEN** the script prompt templates are read
- **THEN** each splices the prompt fragment that describes Carl and Vienna in full, and neither refers to a page outside
  the repo

#### Scenario: The Podcast Episode ends on the hosts' goodbye

- **WHEN** a Podcast Episode's script is built from its segments
- **THEN** it ends on the last segment's sign-off, then Carl's and Vienna's two fixed lines, each said by its own host,
  then the last segment's own goodbye

### Requirement: The script is schema-checked and rejected past its limits

The writer's output SHALL be validated against a schema before anything is rendered. It SHALL have a title of at most 60
characters, specific to what the chapters cover, in the host's voice and never clickbait. It SHALL have a description of
at most 155 characters that starts with "Carl and Vienna talk about", a short cold open that names the show and its hosts in a sentence or two before it turns to
the topic, segments joined by short transitions, one chapter per Finding that includes the Finding's id, and a
sign-off and a goodbye. A prompt SHALL list its Findings under short numbers from 1 and SHALL never show a
Finding's stored id, and a chapter's number SHALL be mapped back to the Finding's stored id before the output is
checked. The cold open, each transition, each chapter, the sign-off, and the goodbye SHALL each be a list of turns, and a turn SHALL
be a speaker, text, and an optional short style. The text SHALL read as natural speech, with fillers like "well", short
replies like "Right.", and inline vocal tags in the syntax that Gemini's speech prompting guide defines.

A first or second draft SHALL be rejected, and the call retried, if a chapter cites a Finding id outside the input set
or writes a Finding twice, a segment does not have one chapter for each of its Findings, the outline plans more than 30
minutes, the title or the description is over its limit, a chapter has more than three quotations or a quotation over 30
words, or the first segment has no cold open or the last no sign-off or no goodbye. Only a quoted span of six words or more SHALL
count as a quotation. A retried call SHALL be told why its last draft was rejected, with the numbers that the check
measured, so the next draft can fix it. A call's third draft SHALL be repaired instead of rejected: a long title or
description SHALL be cut at a word boundary, a chapter for a Finding outside the input set, a second chapter for one
Finding, and a chapter that quotes too much SHALL be left out, and a missing chapter, cold open, sign-off, or goodbye and a
plan over 30 minutes SHALL be accepted. Every draft SHALL have a chapter title over 80 characters cut and a planned chapter
length outside one to eight minutes brought within it, with no rejection. Only a draft that does not match the schema on
every try, a script with no chapter left, a script call that finds the budget spent, speech that renders no chapter, or
a failure of the encoder, the database, or object storage SHALL fail the Podcast Episode. A chapter whose speech fails
for good, a spent budget included, SHALL be left out, and the Podcast Episode SHALL fail only if no chapter renders.

#### Scenario: An unknown Finding id is rejected

- **WHEN** a segment's first draft has a chapter citing an id that was not in its input
- **THEN** the draft is rejected and the call is retried

#### Scenario: A third draft is repaired instead of failing the Podcast Episode

- **GIVEN** a segment's third draft with one chapter for a Finding in its input
- **WHEN** the draft also has a chapter citing an id that was not in its input, and has no sign-off
- **THEN** that chapter is left out, the segment keeps its valid chapter and no sign-off, and the episode renders

#### Scenario: A chapter cites its Finding by the prompt's number

- **GIVEN** a segment's prompt that lists three Findings as 1, 2, and 3
- **WHEN** the output's second chapter cites 2
- **THEN** that chapter is saved with the stored id of the second Finding listed

#### Scenario: A long chapter is not rejected

- **WHEN** a chapter's text is over 450 words
- **THEN** the output is not rejected for its length

#### Scenario: A retried call is told what to fix

- **WHEN** a segment's draft is rejected for a chapter with four quotations
- **THEN** the next call's prompt names that chapter and the limit of three quotations

#### Scenario: A fourth quote is rejected

- **WHEN** a chapter's text has four passages in quotation marks
- **THEN** the output is rejected and the call is retried

#### Scenario: A chapter that keeps quoting too much is left out

- **GIVEN** a segment of three chapters whose third draft has one chapter with four quotations
- **WHEN** that draft is checked
- **THEN** the segment is kept with its other two chapters, the Podcast Episode renders without the third, and the
  dropped chapter is reported

#### Scenario: A script that keeps failing fails the Podcast Episode

- **WHEN** a script call's output is rejected three times
- **THEN** the Podcast Episode is saved as failed with the reason, and nothing is rendered

#### Scenario: A long title is rejected

- **WHEN** the outline's title is over 60 characters
- **THEN** the output is rejected and the call is retried
