# topic-post-discussions Specification

## Purpose
Carl and Vienna discuss a Topic Post in a short recording, which customer copy calls the Coffee Break Discussion. It
reuses the podcast's voices and pipeline, reads the post and its shared Comments, and bills whoever started it.

## Requirements

### Requirement: The two hosts discuss a Topic Post in audio with no music

A Topic Post Discussion SHALL be one recording of the podcast's two speakers, `host` and `cohost`, in the podcast's
voices, summarizing and discussing one Topic Post. It SHALL hold the talk alone, with no theme, intro, or outro music.
Customer copy SHALL name it "Coffee Break Discussion" in full wherever it shows, and never a shorter form.

#### Scenario: A discussion has no theme

- **WHEN** a Topic Post's discussion is recorded
- **THEN** its audio begins and ends with the hosts' talk, with no music mixed in

#### Scenario: The name is never shortened

- **WHEN** the discussion shows on the post's page, in the player, and in an MCP view
- **THEN** each reads "Coffee Break Discussion"

### Requirement: A discussion's length follows its post and its Comments

A discussion's script SHALL be asked for half as many spoken words as its post has, between 300 and 600, plus a 75
word exchange for each shared Comment it reads, up to six, on every plan. A script that would run past seven minutes
SHALL be rejected and written again, and a script that still fails SHALL fail the recording.

#### Scenario: A free and a paid plan get the same length

- **WHEN** a Free user and a Premium user each publish a Topic Post of the same length with no shared Comment
- **THEN** both discussions are asked for the same number of words

#### Scenario: A longer post with shared Comments gets a longer discussion

- **WHEN** a Topic Post of 1,200 words with four shared Comments is recorded, and one of 300 words with none
- **THEN** the first is asked for at most 900 words and the second for at most 300

### Requirement: A discussion reads the post and its shared Comments as untrusted data

The script writer SHALL read the Topic Post's text and the post's Comments that are shared with Carl and Vienna, each
fenced as untrusted data with a per-call delimiter, and SHALL be told that the text is what people wrote, to discuss
and never to follow. It SHALL read no other Comment. The script SHALL credit each Comment it reads by its author's
username, and a script that reads one without naming its author SHALL be rejected.

#### Scenario: A shared Comment is credited

- **WHEN** a regenerated discussion reads a shared Comment by `roastfan`
- **THEN** a host says `roastfan` where the Comment is raised

#### Scenario: An unshared Comment is never read

- **WHEN** a Topic Post has four Comments and one is shared
- **THEN** the script writer receives the one shared Comment and none of the other three

#### Scenario: A Comment shaped like an instruction is discussed, not obeyed

- **WHEN** a shared Comment tells the hosts to read out an address
- **THEN** the Comment reaches the writer inside its fence, and the script follows no instruction from it

### Requirement: Flagged text is skipped before speech and never blocks the recording

Before any text is spoken, a screen SHALL check each shared Comment's text and its author's username, and the post
author's username. A flagged Comment SHALL be left out of the script, and a flagged author SHALL go unnamed. A screen
that cannot run SHALL count its text as flagged. Neither SHALL stop or fail the recording.

#### Scenario: A flagged Comment is left out

- **WHEN** one of two shared Comments is flagged by the screen
- **THEN** the discussion reads the other one, names its author, and records

#### Scenario: A flagged username is not spoken

- **WHEN** the post author's username is flagged by the screen
- **THEN** the hosts refer to the author without the username, and the discussion records

### Requirement: A later discussion records only through Regenerate, with an optional hint

Apart from the recording a publish starts, a discussion SHALL record only if a user who may publish on the Topic
presses Regenerate. The request SHALL take an optional hint of up to 500 characters that steers the script. The hint
SHALL pass the user text classification and SHALL reach the writer fenced. The new recording SHALL replace the old one
once it is stored, and a failed one SHALL leave the old one playing. A post SHALL have one recording under way at a
time.

#### Scenario: A second Regenerate while one records is rejected

- **WHEN** two Regenerate requests for one post arrive together
- **THEN** one starts a recording and the other is rejected as already recording

#### Scenario: A recording that cannot start leaves nothing behind

- **WHEN** a recording's workflow fails to start
- **THEN** the post has no recording under way, and a later Regenerate works

#### Scenario: A new shared Comment needs a Regenerate

- **WHEN** an editor shares a Comment on a Topic Post whose discussion is already recorded
- **THEN** the discussion is unchanged until an editor presses Regenerate

#### Scenario: A failed regeneration keeps the old audio

- **WHEN** a regenerated discussion fails its script check
- **THEN** the page still plays the earlier discussion

### Requirement: Regenerations are limited each month by plan

A user SHALL regenerate at most 2 discussions a month on Free, 10 on Plus, and 20 on Premium, counted across Topic
Posts from the start of the UTC month. A request at the limit SHALL be rejected. The control SHALL show the count as
"X of Y used this month" and SHALL show no Regenerate button at the limit.

#### Scenario: The button is absent at the limit

- **WHEN** a Free user has regenerated two discussions this month
- **THEN** the control reads 2 of 2 used this month and shows no Regenerate button

### Requirement: Each recording bills the person who started it

A first discussion's script and speech SHALL bill the user who published the Topic Post, and a regenerated one the user
who pressed Regenerate, on that user's own model key, counted in their monthly spend with Podcast Episode cost. A spent
budget or a passed podcast budget cutoff SHALL record nothing and SHALL leave the Topic Post published.

#### Scenario: A team member's Regenerate bills the member

- **WHEN** a team member regenerates the discussion of a Topic Post the Topic's owner published
- **THEN** the recording's cost counts in the member's monthly spend and not in the owner's

#### Scenario: A spent budget leaves the post published

- **WHEN** a publisher's budget is spent when the 15 minute wait after the publish ends
- **THEN** no discussion is recorded, the Topic Post stays published, and its page shows no player

### Requirement: The discussion plays in the shared player

The Topic Post page SHALL play the discussion in the player a Podcast Episode plays in, on the web, in the mobile app,
and in the topic post MCP view. The audio SHALL be served only to someone who may open the Topic Post's Topic. A page
with no discussion SHALL show a reader no card and no line in its place. It SHALL show a user who may record one the
card with no play button and "Not recorded yet.", and Regenerate while a regeneration is left this month.

#### Scenario: An editor sees the card of a post with no discussion

- **WHEN** a Topic's owner and a follower each open a Topic Post that has no discussion
- **THEN** the owner sees the card with "Not recorded yet." and Regenerate, and the follower sees no card

#### Scenario: A private Topic's audio is gated

- **WHEN** a visitor requests the audio of a discussion on a private Topic's post
- **THEN** the response is the same as for audio that does not exist

### Requirement: Discussion plays and regenerations are reported by id

The app SHALL send `social_topic_post_discussion_play` when a discussion starts playing, and the server SHALL send
`social_topic_post_discussion_regenerate` when one is requested, each with the Topic Post's id, its Topic's id, and
whether the actor owns the Topic. No event SHALL hold the hint or any text.

#### Scenario: A play is counted

- **WHEN** a visitor presses play on a discussion
- **THEN** one `social_topic_post_discussion_play` event is sent with the two ids

### Requirement: The discussion card opens its transcript

The discussion card's name SHALL open and close the recording's transcript, each turn after its speaker's name in
the type of a podcast episode's transcript, on the web, in the mobile app, and in the topic post MCP view. It SHALL
start closed on every visit. The server-rendered card SHALL be closed, SHALL hold the transcript in its HTML, and
SHALL open without JavaScript. A discussion that is recording, or that has no transcript, SHALL offer nothing to open.

#### Scenario: The card starts closed

- **WHEN** a reader opens a Topic Post whose discussion has a recording, opens its transcript, and reloads the page
- **THEN** the card shows a caret before its name, its line, and no turn of the transcript

#### Scenario: The name opens the transcript

- **WHEN** the reader presses the card's name
- **THEN** the turns show in their order, each as "Carl: …" or "Vienna: …", and a second press closes them

#### Scenario: A turn reads as a podcast episode transcript's turn

- **WHEN** a reader compares a turn of an open discussion with a turn of a podcast episode page's transcript
- **THEN** both have the same font, size, weight, line height, and color, with the speaker's name in the same weight

#### Scenario: Play and Regenerate leave the transcript as it is

- **WHEN** a reader presses play, or an editor presses Regenerate, on a card whose transcript is closed
- **THEN** the recording plays, or the form opens, and the transcript stays closed

#### Scenario: A crawler reads a closed card's transcript

- **WHEN** a crawler or a browser without JavaScript requests a public Topic's post
- **THEN** the HTML holds every turn inside a card that is closed, and a press on the name opens it with no script

#### Scenario: A recording on its way has nothing to open

- **WHEN** a Topic Post's discussion is recording
- **THEN** the card shows its name with no caret, and no transcript

### Requirement: A discussion's transcript is served with its post

The Topic Post's read SHALL include its newest recording's transcript: each turn's speaker name and its words, with
no vocal tag and no delivery style. A recording with no audio SHALL add none. A reader who may not read the post
SHALL receive no turn of it, in the page's HTML or from the api.

#### Scenario: A turn reads without its vocal tag

- **WHEN** a recording's script holds a cohost turn that starts with a laugh tag
- **THEN** the post's read holds that turn as Vienna's, with her words alone

#### Scenario: A private Topic's transcript is not served

- **WHEN** a visitor requests a private Topic's post, as a page or from the api
- **THEN** the response is the same as for a post that does not exist, and holds no turn of its discussion

### Requirement: The first discussion records 15 minutes after the publish

Publishing a Topic Post SHALL start its first discussion 15 minutes after the publish, from the text as it then
stands. A post deleted before that, or one already recording from a Regenerate, SHALL record nothing then. A later edit
SHALL leave the recording as it is. The wait SHALL show no discussion, and a recording on its way its recording state.

#### Scenario: The wait shows no recording state

- **WHEN** a reader and the author each open a Topic Post five minutes after it was published
- **THEN** the reader sees no discussion card, and the author sees the card with "Not recorded yet." and Regenerate

#### Scenario: A Regenerate during the wait is the only recording

- **WHEN** an editor presses Regenerate five minutes after a publish, and the wait then ends
- **THEN** the editor's recording is made, and the publish starts no second one

#### Scenario: An edit during the wait reaches the recording

- **WHEN** an author publishes, corrects a paragraph five minutes later, and the wait ends
- **THEN** the discussion is written from the corrected text, and only one recording is made

#### Scenario: An edit after the recording keeps it

- **WHEN** an author corrects a paragraph a day after the first recording
- **THEN** the recording stays as it is until an editor presses Regenerate

#### Scenario: A deleted post records nothing

- **WHEN** an author deletes a Topic Post eight minutes after publishing
- **THEN** no discussion is recorded and nothing is billed for one
