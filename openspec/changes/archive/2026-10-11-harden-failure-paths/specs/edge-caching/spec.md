## ADDED Requirements

### Requirement: A deleted avatar is purged from the edge by its tag

A user avatar response SHALL include `Cache-Tag: user-avatar:<userId>`, and a team avatar response `Cache-Tag:
team-avatar:<teamId>`, at every version. The purge SHALL take any list of tags, and the release purge SHALL keep
clearing `rendered` through it. Once an account close or a team deletion has committed, the api SHALL purge that
account's or team's tag once, reading `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_API_TOKEN` from its own environment. A failed
purge SHALL be reported, a purge skipped for unset settings SHALL be logged, and neither SHALL fail the deletion.
Nothing retries a purge. The day-long edge lifetime bounds a missed one. Share previews, podcast covers, chat room
preview images, and browser caches are out of scope.

#### Scenario: An avatar response is tagged

- **WHEN** a user avatar or a team avatar is served at any version
- **THEN** the response's `Cache-Tag` names that user's or team's tag

#### Scenario: A deletion purges its tag once

- **WHEN** an account is closed or a team is deleted
- **THEN** one purge request names that tag, sent after the deletion committed

#### Scenario: A failed purge does not fail the deletion

- **WHEN** the purge request fails or the Cloudflare settings are unset
- **THEN** the failure is reported or the skip is logged, and the deletion's response is unchanged

#### Scenario: The release purge still clears the pages

- **WHEN** the release purge job runs
- **THEN** it clears the `rendered` tag as before
