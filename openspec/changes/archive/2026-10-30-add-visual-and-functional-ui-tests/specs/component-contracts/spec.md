## ADDED Requirements

### Requirement: The device component browser opens one story from a development link

In a development build, a `carlnotes:///storybook` link with `STORYBOOK_STORY_ID`, `theme` (`light` or `dark`), and
`capture=1` SHALL open that story in that palette, in capture mode. Capture mode SHALL:

- show the story alone, without the component browser's navigation
- start the clock at the fixture date and seed randomness
- hide development overlays
- mark the story as rendered, or as failed with the error's message

A release build SHALL keep no storybook route.

#### Scenario: A link opens one story in dark

- **WHEN** a development build opens the link for the Button Default story with `theme=dark` and `capture=1`
- **THEN** the screen shows only that story in the Dark roast values, and its rendered marker appears

#### Scenario: A story that throws is marked failed

- **WHEN** the linked story throws while rendering in capture mode
- **THEN** the failed marker appears with the error's message, and no development overlay covers it

#### Scenario: A release build ignores the link

- **WHEN** a preview or production build opens the same link
- **THEN** the guard sends it to the first screen the session's guards allow, and no story renders
