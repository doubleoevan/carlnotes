## Implementation and verification

- [x] Remove the per-Topic rating count check and the shared Journal warning.
- [x] Exercise feedback after 30 distinct endorsements and check the existing prompt budget.
- [x] Verify the change against Postgres and run repository preflight. The database suite passed 26 tests. All 31 ratings and notes returned through the Journal, including the 11 outside the selected prompt groups. Preflight passed 5,577 tests and 137 browser checks.
