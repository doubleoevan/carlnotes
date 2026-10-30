# Spec Delta

## MODIFIED Requirements

### Requirement: The measured numbers are published in the README

The README SHALL carry the harness's precision, recall, and cost-per-topic, so the published claims about the pipeline
are measured rather than asserted.

#### Scenario: The README states measured numbers

- **WHEN** the eval harness has been run for the launch corpus
- **THEN** the README reports its precision, recall, and cost per topic, and no scanner rate

## REMOVED Requirements

### Requirement: The corpus measures the scanner in both directions

**Reason**: The scanner is removed, so there is nothing for the benign-injection set and the attack set to measure. The
weekly scanner update check that ran this measurement is deleted too.

**Migration**: The `injectionProse` and `injectionAttacks` sets leave the fixtures. The labeled Resources and the
precision, recall, and cost measurement are unchanged.
