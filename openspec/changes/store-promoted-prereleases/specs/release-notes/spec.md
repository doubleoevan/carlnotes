## MODIFIED Requirements

### Requirement: The release webhook is signed and acts only on publication

The webhook route SHALL verify the request's HMAC signature against a configured signing secret
before reading the payload. When no signing secret is configured the route SHALL reject the request
rather than skip verification.

The route SHALL act on a `release` event whose action is `published` or `released`. `published` fires
when a release or prerelease is first published; `released` also fires when a prerelease is promoted
to a full release, which `published` does not, so a promotion would otherwise keep its prerelease flag
and stay off the page until somebody ran the sync.

Every other action, including `created`, `edited`, `deleted`, `unpublished`, and `prereleased`, SHALL
be acknowledged and ignored, so that correcting a typo in a published release does not re-fire
anything downstream.

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

#### Scenario: A promoted prerelease is stored

- **WHEN** a correctly signed `release` event arrives with action `released`
- **THEN** the release is upserted by its tag, and its cleared prerelease flag puts it on the page
