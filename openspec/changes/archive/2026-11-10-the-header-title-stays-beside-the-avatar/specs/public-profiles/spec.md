## REMOVED Requirements

### Requirement: The Café's avatar is as tall as a Topic's image on the Topics page

**Reason**: replaced by the requirement below, which keeps the name beside the avatar at every width.

## ADDED Requirements

### Requirement: The Café's header keeps its name beside the avatar

The profile page's header SHALL show the person's avatar at the height the Topics page shows a Topic's image, on the
web and in the mobile app, scaling at phone width as that image does. The name SHALL sit beside the avatar at every
width, wrapping to a second line where it must. The summary line SHALL sit under the name beside the avatar, and SHALL
take the whole width below the avatar once it no longer fits. The person SHALL still change their avatar from it.

#### Scenario: The avatar matches the Topics page's image height

- **WHEN** a profile page and the Topics page render at the same width
- **THEN** the avatar's height equals a Topic image's height on the Topics page, and the summary line sits beside the
  avatar under the name

#### Scenario: A narrow screen drops the summary line first

- **WHEN** a visitor narrows a Café until the summary line no longer fits beside the avatar
- **THEN** the summary line takes the whole width below the avatar while the name stays beside it

#### Scenario: A phone keeps the name beside the avatar

- **WHEN** a visitor opens a Café on a phone
- **THEN** the name sits beside the avatar, and the summary line takes the whole width below it
