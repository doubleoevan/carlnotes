## MODIFIED Requirements

### Requirement: A scheduled Scan emails its new Findings to subscribers

After a scheduled Scan finishes `succeeded`, the worker SHALL email that Scan's new Findings to the Topic's matched
subscribers. New Findings SHALL be the Findings this Scan first found: every Finding row carries a `found_scan_id`,
written once when the row is inserted and never updated, naming the Scan that created it, while `scan_id` names the
latest Scan that reviewed the row and moves on every re-score. The digest SHALL read a Scan's new Findings by
`found_scan_id`, so a Finding that a later Scan re-scored, as a url Source's page is on every Scan, is listed in the
digest of the Scan that found it and in no later digest. The Podcast Episode plan SHALL take the Scan's own Findings by
the same column. The column is nullable and goes null when the Scan it names is deleted. A scheduled Scan that produced
no new Findings SHALL send no email. A manual "Run now" Scan SHALL NOT send the email, and a `failed` Scan SHALL NOT
send one.

#### Scenario: A scheduled Scan with new Findings emails them

- **WHEN** a scheduled Scan succeeds and wrote one or more new Findings for the Topic
- **THEN** an email of those Findings is sent to the Topic's matched subscribers

#### Scenario: A scheduled Scan with no new Findings sends nothing

- **WHEN** a scheduled Scan succeeds but wrote no new Findings
- **THEN** no email is sent

#### Scenario: A re-scored Finding is not listed again

- **GIVEN** a Finding that an earlier Scan found and whose Resource this scheduled Scan re-scored
- **WHEN** this Scan succeeds
- **THEN** the Finding's `scan_id` names this Scan, its `found_scan_id` still names the earlier Scan, and the digest
  lists only the Findings whose `found_scan_id` names this Scan

#### Scenario: The Podcast Episode plan reads the Scan's own Findings the same way

- **WHEN** the Podcast Episode plan takes the Scan's own Findings
- **THEN** it takes the Findings whose `found_scan_id` names the Scan, and a Finding this Scan only re-scored counts
  among the Topic's other Findings

#### Scenario: A manual Scan sends no email

- **WHEN** an owner triggers a manual "Run now" Scan that writes new Findings
- **THEN** no email is sent, since the email fires only for scheduled Scans

#### Scenario: A failed Scan sends no email

- **WHEN** a scheduled Scan finishes `failed`
- **THEN** no email is sent
