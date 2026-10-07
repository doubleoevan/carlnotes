## ADDED Requirements

### Requirement: Theme music opens and closes every new Podcast Episode

Every Podcast Episode rendered after this change SHALL open and close with the theme song. Two clips SHALL be committed
under `worker/assets/podcast/`: `theme-intro.wav`, the song's first 60 seconds, and `theme-outro.wav`, its last 60
seconds, each 44.1 kHz mono 16-bit, so the music is never decoded or resampled at render time. The song's master SHALL
NOT be committed.

The intro clip SHALL fade in over 2 seconds and play at full volume until the cold open starts 40 seconds in. Under the
talk it SHALL play at about -18 dB, and it SHALL fade out over its last 8 seconds, ending at its 60 second mark. The
outro clip SHALL start at about -18 dB under the last 20 seconds of the goodbye, rise to full volume over 2 seconds
after the last word, and play its last 40 seconds to its natural end. The fade in, the lead, the duck level, the fade
out, the overlap, and the rise SHALL each be a named constant.

If a clip is missing, the Podcast Episode SHALL render without that clip. A Podcast Episode rendered before this change
SHALL keep its audio and its times.

#### Scenario: The cold open starts over the intro

- **WHEN** a Podcast Episode renders with both clips
- **THEN** the intro plays alone for the first 40 seconds, the first chapter's talk starts at 40 seconds over the
  ducked intro, and the intro has faded out by 60 seconds

#### Scenario: The outro closes the goodbye

- **WHEN** a Podcast Episode whose talk lasts 440 seconds renders with both clips
- **THEN** the outro starts under the talk at 460 seconds, rises after the last word at 480 seconds, and the Podcast
  Episode ends at 520 seconds

#### Scenario: A missing clip leaves the Podcast Episode without it

- **WHEN** a Podcast Episode renders and `theme-outro.wav` is missing
- **THEN** the Podcast Episode opens with the intro and ends on the last word, with no error

## MODIFIED Requirements

### Requirement: ffmpeg joins the chapters on temp files into one normalized MP3

The chapters' audio SHALL be joined by ffmpeg working on temp files, never held in memory. The theme clips that exist
SHALL be mixed with the joined talk at 44.1 kHz in the same ffmpeg pass, before the loudness filter, so the Podcast
Episode is encoded once and normalized as a whole. The joined audio SHALL be normalized to podcast loudness and encoded
as MP3 at 64 kbps mono, about 14 MB for 30 minutes. With neither theme clip, the ffmpeg arguments SHALL be the ones
that joined a Podcast Episode before the theme music. The file SHALL be stored in object storage through the existing
S3 path, with its byte size and duration recorded on the Podcast Episode. Each chapter's start and end times SHALL come
from the rendered chapters' durations, shifted by the intro's lead if the intro clip is mixed in. The duration SHALL
include the outro clip's tail past the last word if the outro clip is mixed in. The temp files SHALL be deleted once the
Podcast Episode's file is stored. The per-chapter audio SHALL stay for a retried join until the Podcast Episode
publishes, and SHALL be deleted then, and a failed Podcast Episode's per-chapter audio SHALL be deleted when it fails.

#### Scenario: Chapter times follow the rendered audio

- **GIVEN** chapters that rendered at 155, 143, and 142 seconds, and no theme clip
- **WHEN** the Podcast Episode is encoded
- **THEN** the chapters start at 0, 155, and 298 seconds, and the Podcast Episode's duration is 440 seconds

#### Scenario: The theme music shifts the chapter times and lengthens the duration

- **GIVEN** chapters that rendered at 155, 143, and 142 seconds, and both 60 second theme clips
- **WHEN** the Podcast Episode is encoded
- **THEN** the chapters start at 40, 195, and 338 seconds, and the Podcast Episode's duration is 520 seconds

#### Scenario: The file is a 64 kbps mono MP3

- **WHEN** a Podcast Episode is encoded
- **THEN** its stored file is an MP3 at 64 kbps with one channel

#### Scenario: Nothing is left behind

- **WHEN** a Podcast Episode publishes
- **THEN** its temp files and its per-chapter audio objects are deleted

#### Scenario: A failed Podcast Episode leaves no audio

- **WHEN** a Podcast Episode fails after three of its chapters rendered
- **THEN** the three chapter objects are deleted
