## REMOVED Requirements

### Requirement: A table file is screened, and is failed when it cannot be

**Reason**: A table file fails open like every other input, so an unscreenable spreadsheet is stored instead of failed.

**Migration**: Replaced by "A table file is screened before its table text is stored".

## ADDED Requirements

### Requirement: A table file is screened before its table text is stored

A table file SHALL be screened as untrusted text before its table text is stored, on the same path as any other
document, so a detector can reject it.

A table file SHALL fail open like every other input. If a configured scanner's screen does not complete, the table text
SHALL be stored unscreened and the failure logged and reported. The nonce-delimited fence around the topic context holds
its rows as data in every Scan prompt.

The screen for a table file SHALL be given a longer timeout, so a slow screen finishes instead of passing the file unscreened.

#### Scenario: A spreadsheet is screened before table text

- **WHEN** a table file is processed
- **THEN** its text is screened and the table text is built from the screened text

#### Scenario: An unscreenable spreadsheet is stored unscreened

- **WHEN** a scanner is configured and it is unreachable, errors, or times out while screening a table file
- **THEN** the table text is stored, the attachment becomes ready, and the failure is logged and reported

#### Scenario: A deployment without a scanner still projects

- **GIVEN** a deployment running with no scanner url configured
- **WHEN** a table file is processed
- **THEN** it is written as table text normally and is not failed

#### Scenario: Redaction preserves the table's shape

- **WHEN** the scanner redacts an entity inside a cell of a table file attached by url
- **THEN** the substitution is in place and the commas, newlines, and column alignment of the table text are unchanged
