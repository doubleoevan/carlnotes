## ADDED Requirements

### Requirement: A draft names each chapter's Finding in an integer field

The outline call's and the segment calls' schemas SHALL have each chapter name its Finding by the number its prompt
listed it under, in an integer field, so a draft cannot put other text where the number goes. A segment's prompt SHALL
say that its list starts at 1 in every segment, whatever a Finding's place in the whole episode. A number the prompt did
not list SHALL be kept as the draft wrote it and checked as a Finding outside the input set.

#### Scenario: A draft cannot cite a Finding with text

- **WHEN** the outline call writes its chapters
- **THEN** each chapter's Finding is an integer, mapped back to the Finding's stored id before the outline is checked

#### Scenario: A number the prompt did not list is rejected

- **GIVEN** a segment whose prompt lists two Findings as 1 and 2
- **WHEN** a first draft's chapter names 3
- **THEN** the draft is rejected as citing a Finding outside its input, and the call is retried

### Requirement: A sign-off or a goodbye never repeats the goodbye's fixed lines

The goodbye's fixed lines SHALL be Carl's "Well, I've got more reading to do." and Vienna's "You always do.", held once in
the code, and the segment prompt SHALL quote them from there. A segment check SHALL reject a last segment whose sign-off
or goodbye has a turn that repeats one of those lines, ignoring case, end punctuation, and a leading "well", and the call
SHALL be retried with that reason. The last draft's repair SHALL drop such a turn instead of rejecting the draft.

#### Scenario: An earlier draft that repeats a fixed line is retried

- **WHEN** a first draft's goodbye has the turn "I've got more reading to do!"
- **THEN** the draft is rejected for repeating a line that the show adds itself, and the call is retried

#### Scenario: The last draft drops the repeated turn

- **WHEN** the last draft's goodbye repeats a fixed line beside a turn of its own
- **THEN** the repeated turn is left out and the goodbye keeps its own turn
