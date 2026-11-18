# Changes to topic video rendering

## MODIFIED Requirements

### Requirement: The backfill gives each Topic's latest Podcast Episode a film

One backfill workflow under a fixed id SHALL render a film for each Topic's latest published Podcast Episode that has
no film row, and SHALL give no other Podcast Episode its first film. It SHALL include ready films due solely for animation only when an operator has enabled the upgrade and selected those films. A second start SHALL join the one running. It SHALL list public Topics first, then private
and team Topics, a page at a time. The worker SHALL start it on boot in every environment, and
`bun run films:backfill` SHALL start or join it by hand.

#### Scenario: Only the latest Podcast Episode is backfilled

- **GIVEN** a Topic whose two Podcast Episodes were published before films shipped, neither with a film
- **WHEN** the worker boots
- **THEN** the backfill renders a film for the later Podcast Episode only

#### Scenario: A second boot finds nothing

- **GIVEN** a backfill that ended with every Topic's latest Podcast Episode rendered, skipped, or failed, and every
  film at the current render version
- **WHEN** the worker boots again
- **THEN** the backfill lists no Podcast Episode and ends with zero counts

#### Scenario: A second start joins the running backfill

- **GIVEN** the backfill running after a boot
- **WHEN** an operator runs `bun run films:backfill`
- **THEN** the script waits for the running backfill and prints its counts

### Requirement: The backfill re-renders every film below the current render version

An explicitly enabled animation upgrade SHALL use the existing backfill to re-render selected ready films below the current render version on the platform's bill, including a film the backfill rendered itself. Operators can extend the selection to all eligible films after a canary. An animation-only upgrade SHALL read the stored chapter images and SHALL make no source-fetch, image-generation, or speech calls. If the historical inputs cannot be reconstructed at the required quality it SHALL defer the upgrade, leaving the ready film playable. A Podcast
Episode with no film SHALL get none from the re-render. A second run SHALL list no film that is already current.

#### Scenario: Every existing film is re-rendered

- **GIVEN** 78 ready films at version 1 selected for an enabled upgrade with their complete assets
- **WHEN** the backfill runs
- **THEN** each of the 78 is re-rendered with animated chapters and stored at the current render version

#### Scenario: A film the backfill rendered is re-rendered too

- **GIVEN** a film that the backfill rendered for a Topic's latest Podcast Episode before this capability shipped, selected for an enabled upgrade
- **WHEN** the backfill runs
- **THEN** that film is re-rendered

#### Scenario: A second run does nothing

- **GIVEN** a backfill that ended with every film at the current render version
- **WHEN** the backfill runs again
- **THEN** it lists no film and renders nothing

#### Scenario: A Podcast Episode with no film stays without one

- **GIVEN** a Topic's older Podcast Episode that has no film
- **WHEN** the backfill runs
- **THEN** that Podcast Episode still has no film

#### Scenario: A re-render bills nobody

- **WHEN** the backfill re-renders a film using six stored generated images
- **THEN** the upgrade incurs zero image draws and leaves the owner's spend unchanged

## ADDED Requirements

### Requirement: Finding pictures can move within the original montage

The film SHALL retain the approved chapter pictures, their order, crop, zoom, pan, shot timing, crossfades, attribution and captions. A reviewed silent animation MAY add animation inside an exact matching picture. The camera SHALL act on the complete picture. The renderer SHALL keep the original shot whenever safe animation is unavailable.

#### Scenario: Steam rises above both mugs in the host illustration

- **WHEN** an animated film shows the reviewed host illustration in a Finding chapter, hot take, opening or sign-off
- **THEN** a shimmer travels up the steam above both mugs. Both hosts, their hands, the mugs and the microphone stay fixed relative to the desk
- **AND** the complete picture follows its normal camera move and dissolve

#### Scenario: The chapter uses an unfamiliar image

- **WHEN** an eligible public chapter picture has no reviewed animation matching its bytes
- **THEN** one bounded vision request per chapter MAY confirm a numbered close-up and its predefined effect
- **AND** the renderer SHALL validate the picture, origin and region before applying that effect beneath the original camera move
- **AND** a skipped picture or failed selection SHALL keep the original shot

### Requirement: A chapter has a reusable validated video scene plan

Each Finding chapter SHALL persist an episode-owned plan with its approved inventory, reviewed animation file hashes, selected regions and effects, camera moves and frame intervals. Data from an article SHALL NOT supply executable content or file paths. A retry SHALL reuse the original plan against the currently approved inventory. A removed asset SHALL prevent publication of its prior animation.

#### Scenario: A retry encounters a missing picture or animation

- **WHEN** the persisted plan requires an approved picture or animation clip which is no longer available
- **THEN** the retry fails visibly and the existing ready film remains available

### Requirement: Animation occupies only the Finding chapter's assigned frames

Each animated chapter SHALL return video only, at 1280 by 720 and 24 frames per second. Its frame count SHALL equal the difference between the rounded absolute narration endpoints. The joined film SHALL preserve the audio, chapter seeks, caption timing, intro, sign-off, and designated Comment segments.

#### Scenario: Fractional boundaries do not accumulate drift

- **WHEN** a film contains adjacent fractional-second starts, a chapter with a Comment segment, and a sign-off
- **THEN** decoded frame counts match every timeline interval, the joined chapters play in order, and seeking on web, mobile or MCP lands at the same narrated chapter as before

### Requirement: A bounded render preserves the published episode and film

The worker SHALL limit concurrent capture and encoding, memory, temporary disk, and elapsed time. On cancellation or exhaustion it SHALL stop the entire render process tree, release its resources, and preserve the existing publication. A retry SHALL keep the target quality and complete duration.

#### Scenario: Capture stalls or the encoder dies

- **WHEN** the film activity times out, is cancelled, or fails after a partial encode or upload
- **THEN** its children exit, temporary files are reclaimed and no partial film becomes ready
- **AND** a published Podcast Episode and any previously ready film remain playable

#### Scenario: An owner crosses a spend cutoff after recording

- **WHEN** a recorded Podcast Episode needs animation and its owner's spend has since crossed a cutoff
- **THEN** the film completes in full at the published standard through the existing owner billing path

#### Scenario: An optional upgrade competes with a first render

- **WHEN** new films are waiting or the worker lacks capacity for an optional upgrade
- **THEN** it defers admission of the upgrade and gives new films the available render capacity
- **AND** after a complete replacement passes validation, a single guarded publication swaps all ready file references

### Requirement: A new film can animate one generated illustration with Gemini Omni

A new animated film SHALL send at most one displayed generated illustration selected for a public Finding to Gemini Omni. The platform SHALL fund one distinct shot per Free account per UTC calendar month. Plus and Premium SHALL fund up to three and seven respectively from the owner’s budget. Each film MAY also use up to eight distinct local picture effects and the reusable host steam.

#### Scenario: A paid generation succeeds

- **WHEN** the provider returns a five-second video, the worker SHALL remove provider audio and verify the silent video’s dimensions, rate and frame count
- **THEN** matching shots SHALL use the saved video with the original montage and narration

#### Scenario: A request fails or its activity retries

- **WHEN** a competing or retried render encounters a prior reservation for the episode
- **THEN** it SHALL reuse a completed animation for the same approved picture, or retain its local effect after failure, without another provider request

#### Scenario: The account has used its monthly allowance

- **WHEN** another film requests an eligible picture in the same UTC month
- **THEN** an existing animation of that exact picture for the account may be reused without a charge
- **AND** a new picture receives no paid generation once the account reaches its plan limit

#### Scenario: The film has used its local effects

- **WHEN** eight distinct local pictures have been assigned animation
- **THEN** later chapters SHALL make no new picture planning requests
- **AND** the host steam and the Omni animation SHALL use none of these eight slots
