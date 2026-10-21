## ADDED Requirements

### Requirement: An empty dollar setting reads as unset

A dollar setting, `SCAN_BUDGET_USD` or `GLOBAL_DAILY_SPEND_ALERT_USD`, SHALL read as its default if it is unset or set
to an empty string, and as the number of dollars it holds otherwise. A value that is not a number of zero or more
dollars SHALL throw an error naming the setting and the value, so an empty value is never read as zero dollars.

#### Scenario: An empty setting keeps its default

- **GIVEN** `SCAN_BUDGET_USD` set to an empty string
- **WHEN** the per-Scan budget is read
- **THEN** it is the default of 50 cents, not zero

#### Scenario: A word is an error

- **GIVEN** `GLOBAL_DAILY_SPEND_ALERT_USD` set to `ten`
- **WHEN** the setting is read
- **THEN** an error names the setting and the value it got

### Requirement: A LiteLLM key replacement stores the new key only over the key it read

When the monthly budget reset or a plan or budget change replaces a user's LiteLLM key, the new key SHALL be stored
only if the user's row still holds the key the replacement read: the update matches the user and the old key. If no
row matches, because another replacement stored its key first or the row is gone, the replacement SHALL delete its own
new key from the proxy, keep the key the row holds, and SHALL NOT report the lost race as a failed replacement. Once the
new key is stored, the old key SHALL be deleted from the proxy, and a delete the proxy refuses is reported and does not
fail the replacement.

#### Scenario: Two replacements race

- **GIVEN** two replacements for one user that both read the same old key
- **WHEN** the second one's update runs after the first stored its key
- **THEN** the second's update matches no row, its new key is deleted from the proxy, and the user keeps the first's key

#### Scenario: An uncontested replacement stores and retires

- **WHEN** a replacement's update finds the row still holding the old key
- **THEN** the new key is stored and the old key is deleted from the proxy
