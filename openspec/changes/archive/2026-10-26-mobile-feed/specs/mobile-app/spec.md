# Spec Delta

## ADDED Requirements

### Requirement: Mobile uses the phone web page as its visual and copy reference

`apps/mobile/AGENTS.md` SHALL establish the corresponding page on `carlnotes.com` at 375 pixels as the reference for later mobile work. Mobile SHALL use Nightshift colors, type roles, radius, spacing, icons, component variants, hierarchy, and both palettes. Existing matching copy, including Carl's lines, SHALL be preserved. Platform-specific interactions SHALL follow the documented native exceptions.

#### Scenario: A later mobile change has an existing web counterpart

- **WHEN** a developer changes a screen or component represented on web
- **THEN** its implementation and review use that phone web page or named web story and the documented platform exceptions

### Requirement: Mobile deviations require an expected platform behavior

The web's padding, font families, sizes, colors, control styling, and behavior SHALL be the default. A deviation SHALL require an expected mobile convention; visual preference alone SHALL NOT justify one.

#### Scenario: A Topic is a navigation link

- **WHEN** its title links to a Topic screen
- **THEN** it uses Nightshift's matching link treatment; the destination's logo returns Home without a visible Back button and native back gestures remain available

### Requirement: Native exceptions name the web pattern they replace

The mobile guide SHALL map web patterns to iOS Human Interface Guidelines and Android Material conventions: tabs and back navigation, bottom sheets, press states, tooltip alternatives, system pickers, sharing, keyboard behavior, pull to refresh, safe areas, touch targets, system text size, and required sign-in buttons. Each exception SHALL name the replaced web pattern and its native behavior.

#### Scenario: A mobile control replaces a web menu or dialog

- **WHEN** a developer implements navigation or a focused choice on mobile
- **THEN** the guide identifies the matching native tab, navigation stack, or bottom-sheet behavior without a new interaction decision

### Requirement: Every mobile story identifies its web reference

Every mobile story SHALL name the web page or story it matches and describe any documented native exception. Header and Finding-card stories SHALL cover both palettes and the relevant read, bookmark, rating, permission, pending, failure, missing-image, and long-text states. The matching references SHALL support comparison at phone width and enlarged system text size.

#### Scenario: A reviewer opens a mobile Finding story

- **WHEN** the reviewer inspects a bookmarked or consumed Finding story
- **THEN** the story names its web counterpart, presents the matching state, and can be viewed in either palette

## MODIFIED Requirements

### Requirement: Every mobile screen meets the accessibility bar

`apps/mobile/AGENTS.md` SHALL write the accessibility bar every later mobile change follows: every pressable control
has an accessibility label and role, text scales with the system's text size on iOS and Android without clipping, touch
targets are at least 44 points, and colors come from Nightshift, whose contrast test already holds text to WCAG AA.
Every screen SHALL follow these rules. Android targets SHALL meet Material's 48-dp minimum. Active choices, pending
actions, and expandable sections SHALL expose their state, and sheet dismissal SHALL restore focus to its trigger.

#### Scenario: The one screen passes the bar

- **WHEN** a Feed, Topic, Settings, or authentication screen renders with the system text size raised
- **THEN** every control reads a label and role, labels do not clip, and targets meet the platform minimum

#### Scenario: A sheet closes accessibly

- **WHEN** a screen-reader user dismisses a sort or filter sheet
- **THEN** focus returns to the trigger, whose selected value remains available

## REMOVED Requirements

### Requirement: One screen proves the stack end to end

**Reason**: The functional Feed replaces the temporary palette and public-search demonstration.

**Migration**: Keep the authenticated root route as Home. Implement its behavior through `mobile-feed` and move the user's existing account identity to Settings. Keep palette demonstrations in Storybook.
