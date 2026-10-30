# Spec Delta

## Purpose

Keeps explicit, hateful, harassing, or violent content that a Scan finds out of a Topic's Findings and out of link
previews. It does so through each Source's own sensitivity flags and a safety judgment the scorer makes in the same
call that scores relevance.

## ADDED Requirements

### Requirement: A Source's own sensitivity flag skips the post

An ingester SHALL skip a post that its Source platform marks as sensitive, so it never becomes a Resource. Reddit's
`over_18`, X's possibly-sensitive mark on the posting account, and Bluesky's `porn`, `sexual`, `nudity`, and
`graphic-media` labels SHALL each count. A post without a flag SHALL pass to scoring. An access mode that returns no
flag, such as Reddit's RSS fallback, SHALL leave the scorer's safety judgment as the check.

#### Scenario: A Reddit post marked over 18

- **WHEN** a Reddit listing returns a post with `over_18` set
- **THEN** no Resource is created for it, and the other posts in the listing are ingested

#### Scenario: A possibly sensitive tweet

- **WHEN** an X search returns a tweet by an account marked possibly sensitive
- **THEN** no Resource is created for it

#### Scenario: A Bluesky post with an adult label

- **WHEN** an account's feed returns a post, or a post by an account, labeled `porn`, `sexual`, `nudity`, or
  `graphic-media`
- **THEN** the page it links to does not become a Resource

#### Scenario: A post with no flag

- **WHEN** a post has no sensitivity flag
- **THEN** it is ingested as before

### Requirement: The scorer judges safety in the call that scores relevance

Every relevance scoring call SHALL return, beside its score, whether the content is sexually explicit, hateful,
harassing, or violent. The judgment SHALL cover content that does harm itself, never a hard subject reported or
discussed, and SHALL add no model call. A missing safety field SHALL read as safe, like a missing note.

#### Scenario: One call returns the score and the safety judgment

- **WHEN** a Resource is scored by the cheap tier and promoted to the premium tier
- **THEN** two scoring calls are made, as before, and each returns both a score and a safety judgment

#### Scenario: Reporting on violence is not unsafe

- **WHEN** the content is a news article about a war or a crime
- **THEN** the safety judgment reads safe and the Resource is scored on relevance alone

### Requirement: An unsafe Resource never becomes a Finding

A Resource that any scoring call judges unsafe SHALL be marked unsafe and dropped as filtered under its own reason,
counted with the other drop causes. No Finding SHALL be inserted or re-scored for it. A Finding already kept for that
Resource SHALL be left in place, along with the notes and bookmarks on it, for the report button and admin delete.

#### Scenario: An explicit page is dropped

- **WHEN** the cheap tier judges a fetched page sexually explicit
- **THEN** no Finding is written, the Resource is marked unsafe, the drop is counted under the unsafe reason, and the
  premium tier is not called

#### Scenario: A page judged safe on a later score clears the mark

- **WHEN** a Resource marked unsafe is scored again after its content changed and every call judges it safe
- **THEN** the unsafe mark is cleared and the Resource can become a Finding

#### Scenario: A kept Finding is not deleted

- **WHEN** a Resource that already has a Finding with a user's note is judged unsafe on a re-score
- **THEN** the Finding and the note remain, and the Finding's score and explanation are not updated

### Requirement: An unsafe Resource gets no link preview image

A chat link whose url is a Resource marked unsafe SHALL get no preview image. The image SHALL be neither fetched nor
stored nor served. The card's title and description MAY still render, so the link reads as what it is.

#### Scenario: A member posts the url of an unsafe Resource

- **WHEN** a member posts a message linking to a url that a Scan marked unsafe
- **THEN** no image request is made to the page's image url, and the card renders without an image

#### Scenario: An image stored before the mark stops showing

- **WHEN** a preview image was stored for a url before a Scan marked its Resource unsafe
- **THEN** the card renders without the image, and the image route serves nothing for it

#### Scenario: A safe url still gets its image

- **WHEN** a member posts a link whose url is not marked unsafe
- **THEN** the preview image is fetched and served as before
