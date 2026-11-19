## ADDED Requirements

### Requirement: Film publication updates an open Topic page

The Topic page SHALL poll while a newer film renders and show its poster upon publication. A loaded film SHALL continue playing or remain paused until the viewer chooses the new film. Topic and episode loading cards SHALL reserve space for the title and controls.

#### Scenario: Publication during playback
- **WHEN** another film finishes while the viewer has the current film loaded
- **THEN** the page offers the new film and preserves playback until selected

#### Scenario: Publication on an idle page
- **WHEN** a film finishes and there is no active film session to preserve
- **THEN** its poster appears without autoplay
