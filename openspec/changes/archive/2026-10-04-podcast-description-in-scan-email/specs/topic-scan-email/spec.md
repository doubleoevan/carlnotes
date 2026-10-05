## ADDED Requirements

### Requirement: The scan email shows the Podcast Episode's summary

The podcast episode section of a scan email SHALL show the Podcast Episode's description under the cover, beneath an
"Episode summary" heading. A scheduled scan's digest and a manual scan's report SHALL both show it. A Podcast Episode
with no description SHALL show the section with its title and cover alone.

#### Scenario: The digest shows the episode's summary

- **WHEN** a scan email names a Podcast Episode whose description is "Carl and Vienna talk about three agents worth a
  query."
- **THEN** under the cover, an "Episode summary" heading reads that description

#### Scenario: An episode with no description

- **WHEN** a scan email names a Podcast Episode that has a title but no description
- **THEN** the section shows the title line and the cover, and no episode summary
