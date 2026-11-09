## ADDED Requirements

### Requirement: The editor shows the image prompt that drew the current image

A Topic's current image SHALL keep the image prompt its render followed, and none for an image in the house style or an
upload. The topic response SHALL return that prompt only to a user who may edit the Topic. Edit topic's Image prompt
field SHALL open with it, keep it after a regeneration, and clear after an upload.

#### Scenario: An owner reopens the editor after a prompted regeneration

- **WHEN** an owner regenerates with the image prompt "a lighthouse in a storm, oil painting" and later opens Edit topic
- **THEN** the Image prompt field holds "a lighthouse in a storm, oil painting"

#### Scenario: A follower never receives the prompt

- **WHEN** a user who may not edit the Topic opens its page
- **THEN** the topic response's image prompt is null

#### Scenario: An upload clears the prompt

- **WHEN** an owner uploads an image after a prompted regeneration
- **THEN** the Image prompt field is empty, and stays empty when Edit topic opens again
