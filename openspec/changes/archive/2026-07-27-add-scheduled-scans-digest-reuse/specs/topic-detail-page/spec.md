## ADDED Requirements

### Requirement: A failed last Scan is surfaced on the topic page

When a Topic's most recent Scan ended `failed`, the topic page SHALL say so and SHALL show that Scan's recorded error, so a Topic whose Sources have all stopped working is distinguishable from one that legitimately found nothing. The Scan history SHALL show the same error on a failed row. The rest of the page SHALL keep describing the last `succeeded` Scan — its recap, age, and duration — so a failed day does not erase the last real result.

#### Scenario: A topic whose newest Scan failed says so

- **WHEN** the owner opens a Topic whose most recent Scan ended `failed`
- **THEN** the page states that the last scan failed and shows the error recorded on that Scan

#### Scenario: A failed newest Scan does not replace the last succeeded recap

- **WHEN** a Topic has an older `succeeded` Scan with a recap and a newer `failed` Scan
- **THEN** the page still shows the succeeded Scan's recap and last-scan time, alongside the failure notice

#### Scenario: A quiet Topic is not mistaken for a failing one

- **WHEN** a Topic's most recent Scan `succeeded` but kept nothing
- **THEN** no failure notice is shown
