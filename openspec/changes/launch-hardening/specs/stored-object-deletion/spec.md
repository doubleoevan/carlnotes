## ADDED Requirements

### Requirement: A film's stored shots are recorded with a try time past the render's last attempt

A render SHALL record each stored shot's key as pending before it uploads the shot, with a first try time past the
render's last possible attempt in place of the usual upload grace, so the sweep never deletes a shot that a later
attempt will read. The render SHALL delete its shots through `deleteStoredObject` once the film is saved, once the
render fails for good, and once its Podcast Episode is removed. A render that dies leaves the pending rows, and the
sweep deletes its shots after that time.

#### Scenario: The sweep leaves a running render's shots

- **GIVEN** a render in its third hour that has stored shots
- **WHEN** the sweep retries its pending keys
- **THEN** no shot is deleted, and the render's next attempt finds every stored shot

#### Scenario: A lost render's shots are swept

- **GIVEN** a render whose workflow was lost after it stored shots
- **WHEN** the shots' try time has passed
- **THEN** the sweep deletes them and clears their pending rows

#### Scenario: A saved film leaves nothing pending

- **WHEN** a film is saved as ready
- **THEN** its shots are deleted, and no pending row names one
