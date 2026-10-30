# visual-regression Specification

## Purpose
Catch unintended visual changes in the web stories, the MCP cards, and the native stories. Each one is captured the same
way every time and compared with an approved image of its own platform.

## Requirements

### Requirement: Every web story is captured in both palettes at two widths

The web image capture SHALL open every story entry of the built web component browser, and no docs page. Each story
SHALL be captured in Latte and Dark roast, at 375 by 812 pixels and at 1280 by 800 pixels, at a device scale of 1. An
image capture SHALL be taken after the story's play function has finished and its fonts have loaded. A story SHALL be
left out only by the `no-screenshot` tag, with a comment beside the tag saying why.

#### Scenario: A full run captures four images per story

- **WHEN** a full web capture runs over the Button stories
- **THEN** each Button story has a Latte phone, a Latte desktop, a Dark roast phone, and a Dark roast desktop image

#### Scenario: A story with a play function is captured after it

- **WHEN** a story's play function opens a menu
- **THEN** the image capture shows the open menu

#### Scenario: A tagged story is listed, not captured

- **WHEN** a story has the `no-screenshot` tag
- **THEN** the report lists it as skipped with its story id, and no image is taken or compared for it

#### Scenario: A docs page is not captured

- **WHEN** the index lists the Tokens docs page
- **THEN** the capture step opens no page for it

### Requirement: A story's own viewport or theme limits its image captures

A story that pins a viewport or a theme in its own globals SHALL be captured only at that size or in that palette. Each
of its other image captures SHALL be reported as `skipped` with the reason, and SHALL count as neither a pass nor a
failure, even if the story fails at the size it does not pin.

#### Scenario: A phone-only story skips the desktop width

- **WHEN** the HeaderMenu stories pin the phone viewport, and their play function opens a menu that only the phone
  width shows
- **THEN** their phone image captures are compared, and their desktop image captures are reported as skipped because the
  story pins the phone viewport

### Requirement: A web image capture has the same pixels on every run

Web capturing SHALL run in the capture container, which pins the browser build and its fonts, in CI and by default
on a laptop. In every image capture:

- the clock SHALL start at the fixture date in UTC, and the locale SHALL be en-US
- randomness SHALL be seeded
- reduced motion SHALL be on, and animations SHALL be settled before the image is taken
- fonts SHALL come from files in the repo

Every request outside the component browser's own origin SHALL be blocked and named in the report.

#### Scenario: A relative time reads the same tomorrow

- **WHEN** a story shows a Finding's age as "5 days ago" from the fixture date
- **THEN** an image capture a day later shows the same label

#### Scenario: An outside request is blocked and named

- **WHEN** a story loads an image from another host
- **THEN** the request fails in the image capture, and the report names the story and the url

#### Scenario: The fonts load without the network

- **WHEN** the capture runs with no route to Google Fonts
- **THEN** every story renders in Karla and Architects Daughter

### Requirement: An image capture that fails or is unstable is reported, not compared

An image capture SHALL be marked `error` if its story throws, its play function fails, its root renders nothing, or it
times out. An image capture SHALL be marked `unstable` if two images taken a moment apart still differ, under the
comparison's own tolerance, after the retries. Neither SHALL be compared with a baseline, and both SHALL count as
failures.

#### Scenario: A story that throws is an error

- **WHEN** a story's component throws while rendering
- **THEN** the image capture is marked error with the thrown message, and no diff is made

#### Scenario: A looping animation is unstable

- **WHEN** a story keeps changing pixels between two images after the retries
- **THEN** the image capture is marked unstable and the report keeps both images

### Requirement: Each image capture is compared with its own platform's approved baseline

Each stable image capture SHALL be compared, pixel by pixel, with the approved baseline of the same platform, story id,
palette, and size. The comparison SHALL tolerate anti-aliasing and a small color distance. An image capture SHALL be
`passed` if no pixel differs beyond that tolerance and its size matches. Otherwise it SHALL be `changed`, with the count
and share of differing pixels. An image capture SHALL never be compared with another platform's baseline.

#### Scenario: An unchanged story passes

- **WHEN** a story renders the same pixels as its baseline
- **THEN** the image capture is marked passed

#### Scenario: A changed class is detected

- **WHEN** a commit changes the Button's padding
- **THEN** every Button image capture is marked changed, with a diff image that highlights the moved pixels

#### Scenario: A taller render is a change

- **WHEN** a story renders 20 pixels taller than its baseline
- **THEN** the image capture is marked changed, and the report gives both sizes

### Requirement: A new or removed baseline is reported apart from failures

A stable image capture with no approved baseline SHALL be marked `new`, and an approved baseline with no story SHALL be
marked `removed`. Neither SHALL count as a pass or as a failure. Each SHALL be named in the summary as waiting for
approval, and neither SHALL ever be approved automatically.

#### Scenario: A new story waits for approval

- **WHEN** a commit adds a story with no baseline
- **THEN** its image captures are marked new, the summary lists them under waiting for approval, and the job does not
  fail on them

#### Scenario: A renamed story leaves a removed baseline

- **WHEN** a commit renames a story export
- **THEN** the old id's baselines are marked removed and the new id's image captures are marked new

### Requirement: The report keeps every image and a machine-readable summary

Each capture job SHALL write one JSON report with one entry per image capture. Each entry SHALL name its platform, story
id, palette, size or device, and status. It SHALL also give the differing pixel count and share, the baseline, current,
and diff image paths that apply, the blocked requests, and any error text. The run SHALL keep an HTML report that
shows the baseline, current, and diff images side by side, filtered by status.

#### Scenario: A changed image capture has three images

- **WHEN** an image capture is marked changed
- **THEN** its report entry names a baseline, a current, and a diff image, and the HTML report shows all three

#### Scenario: A machine reads the counts

- **WHEN** a script reads the JSON report
- **THEN** it finds the count of each status per platform without parsing the HTML

### Requirement: Baselines are versioned with the code and changed only by approval

Each platform's baselines SHALL be stored in the repo under `ui-tests/baselines/<platform>/`, with the images in Git
LFS. A manifest SHALL record, for each image, the workflow run it was approved from, that run's commit, and the image
capture environment that made it. The baselines SHALL be kept out of the runtime image. No workflow SHALL write, commit,
or push a baseline.

#### Scenario: An approved image is stored in Git LFS

- **WHEN** a developer commits approved images and pushes
- **THEN** the commit holds Git LFS pointers, and the push uploads the images to Git LFS

#### Scenario: Reverting a commit reverts its baselines

- **WHEN** a commit that changed a component and approved its baselines is reverted
- **THEN** the component and its baselines return to their earlier state together

#### Scenario: CI never approves

- **WHEN** a nightly run finds 30 new image captures
- **THEN** no baseline file changes in the repo

### Requirement: Approval copies image captures from a named workflow run

The approval command SHALL take a workflow run id and the image captures to approve, by story id, platform, or status.
It SHALL copy those image captures from the run's artifact into the baselines, update the manifest, and leave the commit
to the developer. It SHALL also remove the baselines marked `removed` if asked to. It SHALL stop before reading the run
if git-lfs is not set up.

#### Scenario: A changed image capture is approved

- **WHEN** a developer approves the changed Button image captures from a run on the local HEAD
- **THEN** the Button baselines and the manifest change in the working tree, and nothing is committed

#### Scenario: Approval without Git LFS

- **WHEN** a developer approves on a machine without git-lfs
- **THEN** the command names the setup steps and stops, and no file changes

### Requirement: Approval rejects an image capture it cannot trust

The approval command SHALL reject:

- an image capture marked `error` or `unstable`
- an image capture from an `--on-host` check, which runs in the host's Chrome outside the capture container
- a run whose commit is not the local HEAD
- an image capture made in a different capture environment than the manifest records for its platform, unless the
  command is told to approve a new environment

#### Scenario: An image capture with an error is rejected

- **WHEN** a developer asks to approve an image capture marked error
- **THEN** the command rejects it, naming the story and its error

#### Scenario: A run on another commit is rejected

- **WHEN** the run's commit differs from the local HEAD
- **THEN** the command rejects the run and names both commits

### Requirement: The accessibility result is reported beside each web story

The web image capture SHALL report the accessibility addon's result for each story it opens, with the violated rule ids
and the count of nodes for each. It SHALL use the WCAG A and AA rules and each story's own overrides that the component
browser already applies. A violation SHALL be listed in its own section of the report and SHALL NOT change an image
capture's status.

#### Scenario: A contrast violation is listed

- **WHEN** a story's text fails the color contrast rule
- **THEN** the report's accessibility section names the story, the rule, and the node count, and the image capture's
  status is decided by its pixels alone

#### Scenario: A story's own override is honored

- **WHEN** the Select Open story turns off `aria-hidden-focus` in its own accessibility config
- **THEN** the report lists no `aria-hidden-focus` violation for that story

### Requirement: Every MCP card state is captured in the card test host

Each card state that the card test host renders from fixtures SHALL be captured in the light and dark host themes, at a
375-pixel phone host and a 720-pixel chat column. The image capture SHALL use the same environment, statuses,
comparison, and report as the web stories, under the `mcp` platform with its own baselines.

#### Scenario: The empty search card is captured

- **WHEN** the card host renders the search card with no results in the dark theme
- **THEN** its image capture is compared with the `mcp` baseline for that state, theme, and width

### Requirement: Every native story is captured on each platform's pinned device

The native image capture SHALL open every mobile story in Latte and Dark roast, through the development build's
component browser link in capture mode. It SHALL run on a pinned Android emulator and a pinned iOS simulator. Each
device SHALL have a fixed screen size and density, the default font scale, en-US, UTC, reduced motion, and animations
off. Each image SHALL be cropped below the status bar, scaled to points, and compared with its own platform's baselines.

#### Scenario: The Android image capture uses its own baseline

- **WHEN** the Android image capture of the Button Default story differs from the iOS baseline but matches the Android
  one
- **THEN** the image capture is marked passed

#### Scenario: The status bar never causes a diff

- **WHEN** two native image captures are taken at different times of day
- **THEN** neither shows the status bar, and the clock in it never causes a change

#### Scenario: A story that cannot open is an error

- **WHEN** the component browser never shows a story's rendered marker within the timeout
- **THEN** the image capture is marked error with the flow's failure text

### Requirement: A parity report sets each shared story side by side

Each run that captures more than one platform SHALL write a parity report with one row per story id present on at least
two platforms. Each row SHALL show the web phone, iOS, and Android image captures in each palette. It
SHALL show an informational similarity score, and SHALL list the story ids that exist on only one platform. The parity
report SHALL never fail a job, and SHALL never treat a safe-area, touch-target, or text-scaling difference as an error.

#### Scenario: A shared Button story appears on three platforms

- **WHEN** a nightly run captures web, iOS, and Android
- **THEN** the parity report shows the Button Default story's three image captures side by side in each palette

#### Scenario: A web-only story is listed

- **WHEN** the Select Open story exists on web alone
- **THEN** the parity report lists it as web only, and no job fails because of it
