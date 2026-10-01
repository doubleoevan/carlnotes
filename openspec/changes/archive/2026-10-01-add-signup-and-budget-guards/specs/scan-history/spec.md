## ADDED Requirements

### Requirement: A manual Scan is rejected before it starts if the key that it bills has spent its budget
After the gate allows a manual Scan, the api SHALL read the budget of the key that the Scan bills from the LiteLLM proxy before the api starts the Scan: the key's recorded spend and its maximum budget. The read is the same check that the scheduled sweep runs. A manual Scan bills the key of the user who requested it, the Topic owner's own or an admin's own, so that user's budget SHALL be the one read. If the key's spend has reached its maximum budget, the api SHALL reject the request with a 402 and the copy "Carl hit this month's coffee budget.", SHALL create no Scan row, SHALL run no Source, and SHALL bill no overage. The Topic page SHALL show that copy in an error toast with a See plans action. The Topic page's existing check of the app's recorded spend SHALL stay as it is: if that spend is already exhausted, the page shows its own out-of-budget copy with a See account action and sends no request. If the user has no key yet, or the read fails or times out, the Scan SHALL start as before.

#### Scenario: An over-budget owner's manual Scan is rejected
- **WHEN** the owner's key has spent its whole budget and the owner activates Run now
- **THEN** the api responds 402, no Scan row is created, no Source runs, and the page shows "Carl hit this month's coffee budget." with See plans

#### Scenario: A rejected Scan bills no overage
- **WHEN** an owner past their daily scan limit with a card on file triggers a manual Scan and their key's budget is spent
- **THEN** the Scan is rejected because of the budget and no overage is billed

#### Scenario: An admin's manual Scan checks the admin's own budget
- **WHEN** an admin triggers a manual Scan on a Topic whose owner's key has spent its budget, and the admin's own key has not
- **THEN** the Scan starts and bills the admin's key

#### Scenario: An unreadable budget starts the Scan
- **WHEN** the proxy does not answer the user's budget read in time
- **THEN** the manual Scan starts as before
