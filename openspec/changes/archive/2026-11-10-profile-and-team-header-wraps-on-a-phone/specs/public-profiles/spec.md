## MODIFIED Requirements

### Requirement: The Café's avatar is as tall as a Topic's image on the Topics page

The profile page's header SHALL show the person's avatar at the height the Topics page shows a Topic's image, on the
web and in the mobile app, scaling at phone width as that image does. The person's Café name SHALL sit beside the
avatar on a wide screen and below it at phone width, with the summary line of the join month and the follower count
under the name. The person SHALL still change their avatar from it on their own page.

#### Scenario: The avatar matches the Topics page's image height

- **WHEN** a profile page and the Topics page render at the same width
- **THEN** the avatar's height equals a Topic image's height on the Topics page, and the summary line sits beside the
  avatar under the name

#### Scenario: A phone puts the name under the avatar

- **WHEN** a visitor opens a Café on a phone
- **THEN** the avatar sits on its own line, and the name and the summary line take the whole width below it
