## ADDED Requirements

### Requirement: Only an admin sets a Topic's feature order, and only on a public Topic

Setting a Topic's feature order SHALL be an admin-only action, authorized on the server through the same gate every other admin action uses rather than by the control being hidden. The control SHALL appear only to an admin, and only on a Topic whose visibility is public.

A Topic that is not public SHALL NOT hold a feature order. A request to rank one SHALL be refused, naming that rule, rather than silently ignored.

#### Scenario: An admin views a public Topic

- **WHEN** an admin opens a public Topic's page
- **THEN** the Rank control is shown between the sort control and the follow and brew controls

#### Scenario: A non-admin views the same Topic

- **WHEN** the owner, a subscriber, or a signed-out visitor opens that Topic
- **THEN** no Rank control is shown, and the Topic's feature order and the featured list are absent from what they receive

#### Scenario: An admin views a private or invite Topic

- **WHEN** an admin opens a Topic that is not public
- **THEN** no Rank control is shown, since a Topic that is not public cannot be featured

#### Scenario: A non-admin calls the route directly

- **WHEN** a request to set a feature order arrives from a user who is not an admin
- **THEN** it is refused, and no Topic's feature order changes

#### Scenario: The route is asked to rank a Topic that is not public

- **WHEN** an admin's request names a Topic whose visibility is not public
- **THEN** it is refused as a conflict, and no Topic's feature order changes

### Requirement: The Rank control reads the Topic's current standing

The control SHALL read `Rank: <position>` when the Topic holds a feature order, naming that position, and `Rank` alone when it holds none. It SHALL carry the tooltip "Set feature order".

#### Scenario: A featured Topic

- **WHEN** an admin opens a public Topic whose feature order is 2
- **THEN** the control reads `Rank: 2`

#### Scenario: A Topic that is not featured

- **WHEN** an admin opens a public Topic with no feature order
- **THEN** the control reads `Rank`

### Requirement: The menu names the Topic holding each position

The menu SHALL show one row per featured Topic, in order, each naming its position and the Topic that holds it, so that choosing a position reads as placing this Topic against the ones around it. A name too long for the row SHALL be truncated rather than wrapped.

After those rows, the menu SHALL offer one further position, one past the last, labelled as a new entry rather than with a Topic's name.

The row holding the Topic whose page this is SHALL be marked, so its own place in the section is visible without reading the names.

#### Scenario: The menu against three featured Topics

- **GIVEN** three Topics hold feature orders 1, 2, and 3
- **WHEN** an admin opens the Rank control
- **THEN** it shows those three named rows in order, then a fourth row offering the new-entry position

#### Scenario: The Topic being viewed is in the list

- **GIVEN** the Topic whose page this is holds feature order 2
- **WHEN** an admin opens the Rank control
- **THEN** the row at position 2 is marked as this Topic

#### Scenario: A long Topic name

- **WHEN** a featured Topic's name is wider than its row
- **THEN** the name is truncated on that row, and the row still shows its position

### Requirement: A Topic already featured is not offered the new-entry position

The new-entry position SHALL be offered only to a Topic that is not already featured. A Topic already in the section has its own numbered row, so the numbered positions already cover every placement including last, and a new entry would mean adding a Topic that is already there.

For such a Topic the row SHALL be shown but disabled, so the section's full length stays visible.

#### Scenario: Ranking a Topic already in the section

- **GIVEN** the Topic whose page this is holds a feature order
- **WHEN** an admin opens the Rank control
- **THEN** the new-entry row is disabled and cannot be chosen

#### Scenario: Ranking a Topic not yet in the section

- **GIVEN** the Topic whose page this is holds no feature order
- **WHEN** an admin opens the Rank control
- **THEN** the new-entry row can be chosen, and choosing it appends the Topic after the last featured Topic

### Requirement: Choosing a position places this Topic and shifts the rest

Choosing a numbered position SHALL give this Topic that position, and SHALL move the Topic that held it, and every Topic below, down by one. Choosing the new-entry position SHALL append this Topic and move nothing.

#### Scenario: Inserting into the middle

- **GIVEN** Topics A, B, and C hold feature orders 1, 2, and 3, and Topic D holds none
- **WHEN** an admin sets Topic D to 2
- **THEN** the orders become A=1, D=2, B=3, C=4

#### Scenario: Appending past the end

- **GIVEN** Topics A, B, and C hold feature orders 1, 2, and 3, and Topic D holds none
- **WHEN** an admin chooses the new-entry position for Topic D
- **THEN** the orders become A=1, B=2, C=3, D=4, and no Topic moved

### Requirement: Every row can release the Topic holding it

Each named row SHALL offer a control that clears the feature order of the Topic on that row, whether or not it is the Topic whose page this is. Clearing SHALL move every Topic below up by one.

This is how a Topic leaves the section, including the Topic being viewed: its own row's control clears it.

#### Scenario: Releasing another Topic from the menu

- **GIVEN** Topics A, B, and C hold feature orders 1, 2, and 3, and the admin is viewing Topic C
- **WHEN** the admin clears the row holding Topic A
- **THEN** Topic A holds no feature order and the orders become B=1, C=2

#### Scenario: Releasing the Topic being viewed

- **GIVEN** the Topic whose page this is holds feature order 2
- **WHEN** the admin clears its own row
- **THEN** it holds no feature order, the Topics below move up one, and the control reads `Rank`

### Requirement: Re-ranking a featured Topic moves it rather than inserting a copy

Choosing a position for a Topic that already holds a feature order SHALL move it: the Topic SHALL leave its current position, the gap SHALL close, and the Topic SHALL then take the chosen position. Its own current position SHALL NOT count against the Topics that shift.

A chosen position beyond the end of the ordering the Topic is joining SHALL land at the end rather than past it, so a move can never leave a gap.

#### Scenario: Moving a Topic down

- **GIVEN** Topics A, B, C, and D hold feature orders 1, 2, 3, and 4
- **WHEN** an admin sets Topic B to 4
- **THEN** the orders become A=1, C=2, D=3, B=4

#### Scenario: Moving a Topic up

- **GIVEN** Topics A, B, C, and D hold feature orders 1, 2, 3, and 4
- **WHEN** an admin sets Topic D to 2
- **THEN** the orders become A=1, D=2, B=3, C=4

#### Scenario: Choosing the position it already holds

- **GIVEN** Topics A, B, and C hold feature orders 1, 2, and 3
- **WHEN** an admin sets Topic B to 2
- **THEN** the orders are unchanged

### Requirement: A change closes the menu and shows its result

Choosing a position or clearing a row SHALL close the menu, so that reopening it reads the section as it now stands rather than as it was. The Topic page and the Feed's ordering SHALL both reflect the change without a manual reload.

#### Scenario: The menu after a rank

- **WHEN** an admin chooses a position
- **THEN** the menu closes, the control reads the Topic's new position, and the Feed's Featured section reflects the new ordering

### Requirement: Feature orders stay contiguous from one

The feature orders across all featured Topics SHALL always be the whole numbers from 1 to the number of featured Topics, each held by exactly one Topic. No gap and no duplicate SHALL survive any ranking, release, deletion, or visibility change.

#### Scenario: No gap survives a removal

- **WHEN** a Topic stops being featured for any reason
- **THEN** every Topic that was below it moves up one, so the orders run from 1 with no gap

#### Scenario: No duplicate survives an insertion

- **WHEN** a Topic takes a position another Topic held
- **THEN** the other Topic moves down, so no two Topics share an order

### Requirement: Leaving the public set releases a feature order

Deleting a featured Topic, or changing a featured Topic's visibility to private or invite, SHALL clear its feature order and move every Topic below it up by one. This SHALL happen in the same transaction as the delete or the visibility change, so a Topic never disappears from the Featured section while leaving a gap behind it.

#### Scenario: A featured Topic is deleted

- **GIVEN** Topics A, B, and C hold feature orders 1, 2, and 3
- **WHEN** Topic B is deleted
- **THEN** the orders become A=1, C=2

#### Scenario: A featured Topic is made private

- **GIVEN** Topics A, B, and C hold feature orders 1, 2, and 3
- **WHEN** Topic B's visibility changes to private
- **THEN** Topic B holds no feature order and the orders become A=1, C=2

#### Scenario: A Topic that was never featured is deleted

- **WHEN** a Topic holding no feature order is deleted or made private
- **THEN** no other Topic's feature order changes

#### Scenario: A Topic becomes public again

- **GIVEN** a Topic whose feature order was released when it was made private
- **WHEN** its visibility changes back to public
- **THEN** it holds no feature order until an admin ranks it again
