## MODIFIED Requirements

### Requirement: A refused share falls back to copying the link, and a dismissal does not

Where the browser rejects the share for missing user activation, the invite URL SHALL be copied to the clipboard and the row SHALL report that the link was copied. It SHALL NOT report that the invite was shared, since it was not, and the person needs to know what is now on their clipboard.

Where the person dismisses the sheet without choosing a destination, nothing SHALL be copied and no error SHALL be surfaced. A dismissal is a decision, not a failure. The token created for it stays valid until it expires or its uses are spent.

#### Scenario: A rejected gesture copies instead

- **GIVEN** a browser that rejects the share call because its user-activation window has closed
- **WHEN** a user activates the share-sheet row
- **THEN** the invite URL is copied to the clipboard and the row reports that the link was copied, not that it was shared

#### Scenario: A dismissed sheet is quiet

- **WHEN** a user opens the sheet and dismisses it without picking a destination
- **THEN** nothing is copied, no error is shown, and the created token remains valid

## REMOVED Requirements

### Requirement: A token shared through the sheet is limited, expiring, and revocable

**Reason**: Its name promises a revoke control that no longer exists. Closing an invite link was removed outright, down to the `revoked_at` column.

**Migration**: Replaced by "A token shared through the sheet is limited and expiring", which keeps the same `max_uses` limit, the same expiry, and the rule that no looser token kind is introduced for this path.

## ADDED Requirements

### Requirement: A token shared through the sheet is limited and expiring

A token handed to the share sheet SHALL be the same kind of token the menu's other destinations hand out, with the same `max_uses` limit and the same expiry. No looser token kind SHALL be introduced for this path.

A token given to the sheet can end up in a group chat, a screenshot, or a public post, which makes it the path most in need of those limits instead of the one that can do without them.

#### Scenario: The sheet's token is limited and expiring

- **WHEN** a token is created for a share through the sheet
- **THEN** it has the same use limit and expiry as a token created for any other invite destination
