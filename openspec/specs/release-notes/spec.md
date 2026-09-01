# release-notes Specification

## Purpose
TBD - created by archiving change add-release-notes-page. Update Purpose after archive.
## Requirements
### Requirement: A release body separates its summary from its generated list

A release body SHALL be written as a hand-written summary, then the sentinel `<!-- more -->`, then
the auto-generated pull request list inside a `<details>` block. `.github/release.yml` SHALL sort the
generated list into features, fixes, and dependencies by pull request label, and SHALL exclude
dependency-bot authors from it. The convention SHALL be documented in the repository so a release
written months later still follows it.

An image in a release body SHALL be referenced by an absolute URL, never a GitHub attachment URL,
which is tied to the release's own rendering context. One asset then serves the release, the page, and
a later email alike.

#### Scenario: A release body carries a summary and a list

- **WHEN** a maintainer writes a release body with a summary, the `<!-- more -->` sentinel, and the generated list
- **THEN** the body is stored whole, with the sentinel intact

#### Scenario: Dependency bumps are sorted away from features

- **WHEN** GitHub generates the pull request list for a release
- **THEN** pull requests are grouped into features, fixes, and dependencies by label, and pull requests authored by a dependency bot are omitted

### Requirement: Published releases are stored in the app's own database

The app SHALL store each published release: its tag, name, body markdown, published date, GitHub URL,
and prerelease flag. The tag SHALL be the key a write upserts on, so a re-delivered webhook updates
the existing row rather than adding a second one.

The body SHALL be stored as markdown exactly as GitHub holds it. Rendered HTML SHALL NOT be stored,
so there is no second representation to go stale when a body is edited.

The stored shape SHALL carry everything an email broadcast needs to send a release later, so that
adding the broadcast requires no schema change.

#### Scenario: A release is stored on publish

- **WHEN** a release is published
- **THEN** a row exists for its tag holding the name, body markdown, published date, GitHub URL, and prerelease flag

#### Scenario: The same tag is delivered twice

- **WHEN** a webhook for a tag that already has a row is delivered again
- **THEN** the existing row is updated and no second row is created

### Requirement: The release webhook is signed and acts only on publication

The webhook route SHALL verify the request's HMAC signature against a configured signing secret
before reading the payload. When no signing secret is configured the route SHALL reject the request
rather than skip verification.

The route SHALL act only on a `release` event whose action is `published`. Every other action,
including `created`, `edited`, `deleted`, `unpublished`, and `prereleased`, SHALL be acknowledged and
ignored, so that correcting a typo in a published release does not re-fire anything downstream.

#### Scenario: An unsigned request is rejected

- **WHEN** a request arrives with a missing or incorrect signature
- **THEN** the route rejects it and writes nothing

#### Scenario: No signing secret is configured

- **WHEN** a request arrives and no signing secret is configured
- **THEN** the route rejects it rather than accepting it unverified

#### Scenario: An edit is ignored

- **WHEN** a `release` event arrives with action `edited`
- **THEN** the route acknowledges it and writes nothing

#### Scenario: A publication is stored

- **WHEN** a correctly signed `release` event arrives with action `published`
- **THEN** the release is upserted by its tag

### Requirement: The releases page renders stored markdown on our own domain

`GET /releases` SHALL render from the stored rows and SHALL NOT call the GitHub API. The page SHALL
render the stored markdown through the app's own markdown pipeline and page style, the same one the
blog pages use, rather than displaying HTML that GitHub pre-rendered.

The index SHALL show only the part of a body above the `<!-- more -->` sentinel. A body with no
sentinel SHALL render whole.

The page SHALL list published, non-prerelease releases, newest first. A prerelease SHALL NOT appear.
A draft never reaches the table and therefore never appears.

#### Scenario: A pageview reads only our database

- **WHEN** `/releases` is requested
- **THEN** the response is rendered from stored rows with no request to the GitHub API

#### Scenario: Only the summary is shown

- **WHEN** a release body contains a summary, the sentinel, and a generated list
- **THEN** the page shows the summary and not the generated list

#### Scenario: A body without the sentinel still renders

- **WHEN** a release body contains no `<!-- more -->` sentinel
- **THEN** the page renders the whole body

#### Scenario: A prerelease is withheld

- **WHEN** a stored release is flagged as a prerelease
- **THEN** it does not appear on the page

### Requirement: Each release has its own page

`GET /releases/<tag>` SHALL render that one release whole, generated pull request list included, since
a reader who navigated to a single release wants all of it. It SHALL declare its own canonical URL and
title naming that release, so it is linkable, shareable, and indexable apart from the index.

A tag with no published, non-prerelease row SHALL answer 404.

#### Scenario: One release renders on its own page

- **WHEN** `/releases/v0.4.0` is requested and that release is published
- **THEN** the page renders its whole body and declares a canonical URL and title naming that release

#### Scenario: An unknown tag is not found

- **WHEN** a tag has no published, non-prerelease row
- **THEN** the response is a 404

#### Scenario: The index links through to each release

- **WHEN** `/releases` is requested
- **THEN** each listed release links to its own page

### Requirement: A sync script seeds history and repairs missed deliveries

A script SHALL read the releases from the GitHub API and upsert them by tag, performing the same
write the webhook performs. It SHALL skip drafts. It SHALL be idempotent and safe to re-run at any
time.

The script SHALL be the documented repair path when a webhook delivery is missed, as well as the
means of seeding the releases published before the webhook existed.

#### Scenario: Releases published before the webhook are seeded

- **WHEN** the script is run against a repository whose releases predate the webhook
- **THEN** every published, non-draft release has a stored row

#### Scenario: Running it twice changes nothing further

- **WHEN** the script is run a second time with no new releases
- **THEN** the stored rows are unchanged and no duplicates appear

#### Scenario: A dropped delivery is reconciled

- **WHEN** a webhook delivery was missed and a published release has no row
- **THEN** running the script creates that row

