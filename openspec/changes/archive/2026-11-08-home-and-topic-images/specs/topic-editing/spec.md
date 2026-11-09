# Spec Delta

## ADDED Requirements

### Requirement: The editor shows the image with Regenerate and Upload

The topic editor SHALL show the Topic's `page` image with Regenerate, Upload, and, for an upload, Remove. A press on the
image SHALL upload too, with a camera overlay on hover or keyboard focus in the browser. Regenerate SHALL take an
optional image prompt and SHALL be absent once the month's limit is spent, and the `X of Y` regenerations SHALL
sit at the end of the Upload row. The editor SHALL show the empty image frame pulsing and one line while a render runs,
SHALL swap the image in place when it finishes, and SHALL show a notice only if it fails.

#### Scenario: An owner regenerates with an image prompt

- **WHEN** an owner types "a harbor at night, in rain" and presses Regenerate
- **THEN** the count drops by one, the empty frame pulses while the render runs, and the new image appears in place
  when the render finishes

#### Scenario: The limit hides the control

- **WHEN** an owner has spent the month's regenerations
- **THEN** the editor shows the image and Upload your own and no Regenerate control
