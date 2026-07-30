## MODIFIED Requirements

### Requirement: Manual scans are gated by the daily scan limit, soft with a card on file

`isAllowed(user, "scan:manual", topic)` SHALL enforce the effective plan's daily scan limit, counted per user per UTC day across the user's Topics (the shared scheduled-and-manual pool). Whether that ceiling is hard or soft SHALL follow the metered-overage rule in `subscription-billing` — soft with a card on file, hard without; an admin SHALL bypass it.

A manual Scan SHALL be charged to the user who started it, not to the Topic's owner. The Scan's recorded owner, which is what the daily count and the monthly spend sum read, SHALL be the acting user, and the Scan's model calls SHALL bill that user's LiteLLM key. For an owner scanning their own Topic these are the same person. For an admin scanning a Topic they do not own, the Topic owner's daily quota and monthly budget SHALL be untouched, so an admin's Scan can never make the owner's own scheduled Scans skip for quota.

A scheduled Scan SHALL remain charged to the Topic's owner, since no user started it.

#### Scenario: A manual scan within the daily limit is allowed
- **WHEN** a non-admin owner has run fewer scans this UTC day than their plan's daily scan limit
- **THEN** the gate allows the manual Scan

#### Scenario: A manual scan at the daily limit is gated
- **WHEN** a non-admin owner has reached their plan's daily scan limit
- **THEN** the gate denies the manual Scan unless the metered-overage rule makes the ceiling soft (a card on file), while an admin is never denied

#### Scenario: An admin's scan does not draw down the owner's quota
- **WHEN** an admin runs a manual Scan on a Topic they do not own
- **THEN** the Scan is recorded against the admin, the Topic owner's remaining scans for the day are unchanged, and the owner's monthly spend does not move

#### Scenario: An owner's own scan is charged to them
- **WHEN** a Topic's owner runs a manual Scan on their own Topic
- **THEN** the Scan is recorded against that owner, exactly as before

#### Scenario: An admin's scan cannot suppress the owner's scheduled scans
- **WHEN** an admin runs manual Scans on a free-plan user's Topics and the sweep later runs
- **THEN** that user's own Topics are still scanned, because the admin's Scans never entered their daily pool
