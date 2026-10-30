# Spec Delta

## MODIFIED Requirements

### Requirement: A release passes the acceptance list

A release SHALL pass a written acceptance list covering devices, accessibility, roles, links, forced update, push
notifications, and the dashboards, and an item not checked SHALL be named in the release record as unverified, never
marked passed.

#### Scenario: Devices and themes

- **WHEN** the list is run
- **THEN** phones and tablets in both orientations with the keyboard, safe areas, larger text, and both palettes pass

#### Scenario: Accessibility and the small phone

- **WHEN** the list is run
- **THEN** VoiceOver traverses every screen and the proposed Topic card works with the iPhone SE keyboard

#### Scenario: Roles and a second account

- **WHEN** the list is run
- **THEN** the owner, member, editor, read-only follower, leader, and admin flows pass, and a second account's Profile
  defaults are checked

#### Scenario: Links, update, and dashboards

- **WHEN** the list is run
- **THEN** each app link passes installed and uninstalled, cold and warm, the forced update and its recovery pass on
  each platform, Android passes on a device, and the analytics and error dashboards are checked with real access

#### Scenario: Push notifications

- **WHEN** the list is run
- **THEN** on a device for each platform, the in-context permission sheet, a denial and its settings guidance, a Topic
  push and a mention push opened from the foreground, the background, and a closed app, sign-out unbinding, and a
  second account on the same phone pass, and the data inventory names the push token

#### Scenario: An item is unverified

- **WHEN** a release ships with an item not checked
- **THEN** the release record names the item as unverified
