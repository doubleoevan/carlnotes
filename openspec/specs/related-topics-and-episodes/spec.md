# related-topics-and-episodes Specification

## Purpose
TBD - created by archiving change add-related-topics-and-episode-search. Update Purpose after archive.
## Requirements
### Requirement: A topic's vector is the mean of its kept findings' resource embeddings

A Topic's vector SHALL be the mean of the resource embeddings of its kept Findings, the Findings no user rated down,
counting only resources embedded with `EMBED_MODEL_NAME`, computed in SQL with pgvector's `avg`. The vector SHALL be
stored with its embedding model in its own table keyed by the Topic, never as a column on `topics`. The vector SHALL
save whether the Topic is public and shown, and a partial HNSW cosine index SHALL cover the vectors saved as public and
shown. The worker SHALL write a Topic's vector after every Scan of the Topic ends, succeeded, stopped, or failed. A
save that changes a Topic's visibility, and a change to one of its Findings' ratings, SHALL write it again, and a failed
write SHALL never fail the save or the rating. A Topic with no embedded kept Finding SHALL have no vector, and its
earlier vector SHALL be deleted. Deleting a Topic SHALL delete its vector.

#### Scenario: A rating writes the topic's vector again

- **GIVEN** a public shown Topic with three kept Findings and a vector saved as public and shown
- **WHEN** a user rates one of its Findings down
- **THEN** the Topic's vector is written again from the two Findings left, with its public and shown flag off, since
  the Topic is still public but no longer shown

#### Scenario: A stopped scan writes the topic's vector

- **GIVEN** a public shown Topic whose Scan kept two new Findings before its user stopped it
- **WHEN** the Scan saves as stopped
- **THEN** the Topic's vector is written again from its kept Findings

#### Scenario: A succeeded scan writes the topic's vector

- **GIVEN** a Topic whose kept Findings name three resources embedded with the current model
- **WHEN** a Scan of the Topic succeeds
- **THEN** the Topic's vector is the mean of those three embeddings, saved with the current model

#### Scenario: Another model's embedding is left out of the mean

- **GIVEN** a Topic with one kept Finding whose resource another model embedded and two embedded with the current
  model
- **WHEN** the Topic's vector is written
- **THEN** the vector is the mean of the two current-model embeddings alone

#### Scenario: A private topic's vector has its public and shown flag off until it is public

- **GIVEN** a private Topic with five embedded kept Findings
- **WHEN** a Scan of the Topic succeeds, and later its owner makes it public with enough Findings to list
- **THEN** the Topic's vector has its public and shown flag off after the Scan, and on once the save makes it public

#### Scenario: A topic with no embedded finding has no vector

- **GIVEN** a Topic whose kept Findings name no resource embedded with the current model
- **WHEN** a Scan of the Topic succeeds
- **THEN** the Topic has no vector, and its page lists no related topics

### Requirement: A published episode's vector is the mean of its chapters' resource embeddings

A published Podcast Episode's vector SHALL be the mean of the resource embeddings of its chapters, counting only
resources embedded with `EMBED_MODEL_NAME`, computed in SQL with pgvector's `avg`. The vector SHALL be stored with its
embedding model in its own table keyed by the Podcast Episode, never as a column on `episodes`, with an HNSW cosine
index. The worker SHALL write the vector in the transaction that publishes the Podcast Episode. Removing a Podcast
Episode, by hand or by a later short Podcast Episode replacing it, SHALL delete its vector, so only a published Podcast
Episode has one. Deleting a Topic SHALL delete its Podcast Episodes' vectors. The vector SHALL save whether its Topic
is public and shown, at publish and again whenever the Topic's vector is written, and a partial HNSW cosine index
SHALL cover the vectors saved as public and shown.

#### Scenario: A publish writes the episode's vector

- **GIVEN** a recording Podcast Episode whose chapters narrate four resources embedded with the current model
- **WHEN** the Podcast Episode publishes
- **THEN** its vector is the mean of the four embeddings, written with the published row

#### Scenario: A removed episode has no vector

- **GIVEN** a published Podcast Episode with a vector
- **WHEN** the Topic's owner removes it, or a later short Podcast Episode of the Topic replaces it
- **THEN** the removed Podcast Episode's vector is deleted

#### Scenario: An episode vector follows its topic's listing

- **GIVEN** a public shown Topic's published Podcast Episode, its vector saved as public and shown
- **WHEN** the Topic's owner makes it private
- **THEN** the Podcast Episode's vector has its public and shown flag off

### Requirement: Relatedness is a centered distance, nearer for shared tags, within a limit

A related Topic's or Podcast Episode's score SHALL be the cosine distance between its vector and the page's after both
have the centroid taken out, less 0.1 for each tag the two Topics share, counting two tags at most. The centroid SHALL
be the average of up to 20,000 resource embeddings of `EMBED_MODEL_NAME`, cached in Redis for a day. Tags SHALL match
lowercased, with everything but letters and digits left out. A related Topic and a related Podcast Episode SHALL each
score within its own limit, 0.75 for both today, and a page SHALL list them lowest score first. A ranking SHALL score
the 200 nearest candidates by plain cosine distance, found through the HNSW index.

#### Scenario: An unrelated topic is not listed

- **GIVEN** a public shown Topic whose every other public shown Topic scores past 0.75
- **WHEN** a visitor opens its page
- **THEN** the page lists no similar topics

#### Scenario: Shared tags bring a topic within the limit

- **GIVEN** a page's Topic tagged "AI & Engineering" and "Coffee", and a public shown Topic tagged "ai-engineering"
  and "coffee" whose centered distance from it is 0.9
- **WHEN** a visitor opens the page
- **THEN** the tagged Topic is listed after the nearer Topics, with a score of 0.7

#### Scenario: A far topic is never listed

- **GIVEN** a public shown Topic whose centered vector points away from the page's
- **WHEN** a visitor opens the page
- **THEN** the far Topic is not listed, and its Podcast Episodes are not listed on the page's Podcast Episode pages

### Requirement: A topic page lists the related topics the user may open

A Topic's page SHALL end its right column, under Notes, with a "Similar topics" table of the other Topics related to it
that the user may open, lowest score first, up to fifty. A visitor SHALL see the public shown Topics. A signed-in user
SHALL also see the Topics they reach through their account: a Topic they own, a Topic a team of theirs owns or holds,
and an invite Topic that names their verified email or that they subscribe to. An admin SHALL see what their own
account reaches, never every Topic. The table SHALL have one column, Topic, and nothing else: the Topic's name linked
to its page with its latest published Podcast Episode's play button beside it, the same cell the topic tables use. A
Topic with no published Podcast Episode SHALL show its name with no button. The rows SHALL load with the topic page's
data, so the server renders a visitor's. The table SHALL show five rows a page in a browser with JavaScript, sortable
by name, and the first fifty rows in the ranked order in a browser without it. A Topic page with no related Topic and a
Topic with no vector SHALL render no table.

#### Scenario: The related public shown topics are listed

- **GIVEN** a public shown Topic and seven other public shown Topics with vectors within the score's limit
- **WHEN** a visitor opens the Topic's page
- **THEN** the "Similar topics" table lists the seven, lowest score first, five on the first page with JavaScript

#### Scenario: Topics the user cannot open never appear

- **GIVEN** a private Topic, an invite Topic, and a public Topic with fewer than three Findings, each with a vector
  nearer than every public shown Topic's
- **WHEN** a visitor, or a user with no role, invite, or subscription on any of the three, opens a public shown Topic's
  page
- **THEN** none of the three is in the "Similar topics" table

#### Scenario: A user sees the private and invite topics they may open

- **GIVEN** a user who owns a private Topic, is on a team that holds another private Topic, and subscribes to an invite
  Topic, each related to a public shown Topic
- **WHEN** the user opens the public shown Topic's page
- **THEN** the "Similar topics" table lists all three among the public shown Topics, lowest score first, and a visitor
  opening the same page sees none of the three

#### Scenario: A private topic's page lists related topics to the users who may open it

- **GIVEN** a team's private Topic with a vector, a related public shown Topic, and a related private Topic of the same
  team
- **WHEN** a member of the team opens the first Topic's page
- **THEN** the "Similar topics" table lists both related Topics

#### Scenario: A related topic without an episode shows no play button

- **GIVEN** a related Topic with no published Podcast Episode
- **WHEN** the table renders
- **THEN** the Topic's row shows its linked name and no play button

#### Scenario: A browser without JavaScript sees fifty rows

- **GIVEN** a public shown Topic with sixty related Topics
- **WHEN** a client without JavaScript fetches the page
- **THEN** the table holds the fifty nearest rows

### Requirement: An episode page lists the topic's other episodes and the related episodes the user may listen to

A published Podcast Episode page SHALL end with two tables. "Other episodes" SHALL list the Topic's other published
Podcast Episodes that the user may listen to, newest first, so an invite Topic's subscriber sees only the ones
published after their subscription activated. It SHALL have two columns: Episode, the Podcast Episode's title linked to
its page with its play button beside it, and Description. Under it, "Similar podcasts" SHALL list published Podcast
Episodes of other Topics related to the page's Podcast Episode that the user may listen to, lowest score first, with
two columns: Podcast, the title linked to its page with its play button beside it, and Description. A visitor SHALL
see the public shown Topics' Podcast Episodes. A signed-in user SHALL also see the Podcast Episodes of a Topic they
have a role on, and an invite Topic's Podcast Episodes published after their subscription to it activated. Each table
SHALL list up to fifty rows, loaded with the episode page's data so the server renders a visitor's, five rows a page
in a browser with JavaScript, sortable by either column, and the first fifty in their own order without it. A table
with no rows SHALL not render. A play button SHALL play its Podcast Episode in the podcast player.

#### Scenario: The topic's other episodes are listed newest first

- **GIVEN** a public Topic with eight published Podcast Episodes
- **WHEN** a visitor opens one of them
- **THEN** "Other episodes" lists the other seven newest first, each with its description

#### Scenario: Unpublished and removed episodes never appear

- **GIVEN** a public Topic with a recording, a failed, and a removed Podcast Episode, and another public shown Topic
  with the same
- **WHEN** a visitor opens a published Podcast Episode of the first Topic
- **THEN** none of those six is in "Other episodes" or in "Similar podcasts"

#### Scenario: A visitor's related episodes come from other public shown topics

- **GIVEN** published Podcast Episodes of a private Topic, an invite Topic, a public Topic with fewer than three
  Findings, and a public shown Topic, each with a vector
- **WHEN** a visitor opens a public Topic's Podcast Episode page
- **THEN** "Similar podcasts" lists only the public shown Topic's Podcast Episode

#### Scenario: A user's related episodes include the ones they may listen to

- **GIVEN** a user on a team that holds a private Topic with a related published Podcast Episode, and subscribed to an
  invite Topic with two related published Podcast Episodes, one published before the subscription activated
- **WHEN** the user opens a public Topic's Podcast Episode page
- **THEN** "Similar podcasts" lists the team Topic's Podcast Episode and the invite Topic's later one, and not the
  earlier one

#### Scenario: An invite topic's subscriber sees the other episodes published after their subscription

- **GIVEN** an invite Topic with four published Podcast Episodes and a subscriber whose subscription activated after
  the second published
- **WHEN** the subscriber opens the fourth
- **THEN** "Other episodes" lists the third alone

#### Scenario: A table with no rows does not render

- **GIVEN** a public Topic's only published Podcast Episode, with no related Podcast Episode
- **WHEN** a visitor opens its page
- **THEN** neither table renders

### Requirement: The related reads are bounded, index-backed, and never slow an existing page

Every related read SHALL be bounded at fifty rows. The public related topics and related episodes reads SHALL find
their candidates through the HNSW cosine indexes of the vectors saved as public and shown, with pgvector's iterative
index scans, so the visibility filters still fill the candidates. Their ranked ids and scores SHALL be cached in Redis
for fifteen minutes per Topic and per Podcast Episode, and SHALL hold public shown rows alone. A signed-in user's own
read SHALL score only the Topics or Podcast Episodes they reach through their account, without an index, and SHALL
never be cached, and the two SHALL merge by score with each row once. Every read SHALL check each row again against the
user's view rules, so a Topic the user may no longer open, or a Podcast Episode that is removed, leaves the table at
once. Each row SHALL include only what its columns, its play button, and its tooltip show: a Podcast Episode as a
summary with its description and its chapter count in place of its chapters, never a vector. The Other episodes read
SHALL use `episodes_topic_published_idx`. The related Topics' latest Podcast Episodes SHALL load in one query for every
row, never one query per row. A poll reload of the topic page while a Scan runs SHALL skip the related topics read,
and the page SHALL keep the ones it loaded. The new reads SHALL run in parallel with each page's existing reads, no
page render SHALL make a model call, and the rendered pages SHALL keep their edge cache. A response with a user's own
rows SHALL be a signed-in response, which the edge never shares.

#### Scenario: The latest episodes load in one query

- **GIVEN** a topic page with fifty related Topics
- **WHEN** the page loads
- **THEN** one query reads every related Topic's latest published Podcast Episode

#### Scenario: A cached related topic that turned private leaves at once

- **GIVEN** a public shown Topic's related topic ids cached in Redis, one of which its owner has since made private
- **WHEN** a visitor opens the Topic's page
- **THEN** the "Similar topics" table leaves the private Topic out, and no ranking read runs

#### Scenario: A poll reload keeps the page's related topics

- **GIVEN** a Topic page showing related topics while a Scan of the Topic runs
- **WHEN** the page polls for the Scan's progress
- **THEN** the poll reads no related topics, and the page still shows the ones it loaded

#### Scenario: A table row's play button counts the chapters it does not include

- **WHEN** a "Similar topics" row's play button shows its tooltip
- **THEN** the tooltip names the Podcast Episode's chapter count and its description, and the row's data includes no
  chapters

#### Scenario: The related queries plan through their indexes

- **WHEN** the public related topics and related episodes queries are planned with sequential scans and sorts off
- **THEN** the related topics plan scans `topic_vectors_public_and_shown_embedding_hnsw`, and the related episodes plan
  scans `episode_vectors_public_and_shown_embedding_hnsw`

#### Scenario: A user's own related reads use no HNSW index

- **WHEN** a user's own related topics and related episodes queries are planned
- **THEN** neither plan scans an HNSW index, so no candidate the user may open is cut off at the index's first results

#### Scenario: A user's own related rows are never cached for anyone else

- **GIVEN** a user whose team holds a private Topic related to a public shown Topic
- **WHEN** the user opens the public shown Topic's page, and then a visitor opens it
- **THEN** the visitor's "Similar topics" table leaves the private Topic out, and the Redis ranking holds public shown
  Topics alone

### Requirement: A podcast episode's tooltip opens on its titles and play buttons

A Podcast Episode's tooltip SHALL name the podcast over the Podcast Episode's season and number, its title, its date,
duration, and chapter count, and its description. It SHALL open on the Podcast Episode's play buttons and its linked
titles: a table's title cell, the episodes card's rows, and the player card on the Podcast Episode's page. The AI voices
note SHALL show on the player card's details line and not in the tooltip.

#### Scenario: A table title opens the tooltip with the description

- **WHEN** a visitor hovers a Podcast Episode's title in the "Other episodes" table
- **THEN** the tooltip shows the Podcast Episode's details and its description, and no AI voices note

