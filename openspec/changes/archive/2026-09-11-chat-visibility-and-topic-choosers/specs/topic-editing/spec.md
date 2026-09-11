## ADDED Requirements

### Requirement: Editing starts with a choice between the form and Carl
The Edit topic option in a Topic page's actions menu SHALL open a dialog with two choices, editing the Topic in the form or editing it with Carl, and the second SHALL open the panel on the user's private chat about the Topic. The option SHALL stay limited to a user who may edit the Topic.

#### Scenario: An editor chooses Carl
- **WHEN** the owner picks Edit topic and then editing it with Carl
- **THEN** the dialog closes and the panel opens on the private chat about this Topic

#### Scenario: An editor chooses the form
- **WHEN** the owner picks Edit topic and then editing it themselves
- **THEN** the edit modal opens pre-filled with the Topic's fields
