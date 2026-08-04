## ADDED Requirements

### Requirement: Monthly spend is the sum of scan spend and chat spend
A user's monthly spend against their effective budget SHALL be the sum of their recorded Scan cost and their recorded chat turn cost for the current UTC month. Every check that reads monthly spend — the manual-scan gate, the chat gate, and the account meter — SHALL read that same sum.

#### Scenario: Chat spend counts toward the monthly budget
- **WHEN** a user has recorded chat turn cost this month
- **THEN** that cost is included in the monthly spend figure the manual-scan gate reads

#### Scenario: Scan spend can exhaust the budget for chat
- **WHEN** a user's Scan cost alone reaches their effective monthly budget
- **THEN** further chat turns are refused

## MODIFIED Requirements

### Requirement: Metering and dunning are surfaced to the user
The UI SHALL show the user their scan usage against the daily limit and any metered overage, SHALL show their monthly spend against their effective budget with chat spend and scan spend rendered as distinct segments of one bar, and SHALL surface a past-due / dunning state when a payment fails, with a path to the Customer Portal to update payment.

#### Scenario: Usage shows against the limit
- **WHEN** a subscribed user views their billing state
- **THEN** the UI shows scan usage against the daily limit and any billed overage

#### Scenario: Chat spend reads apart from scan spend
- **WHEN** a user with both chat spend and scan spend this month views their account page
- **THEN** the spend bar shows the two as distinguishable colored segments against one budget total

#### Scenario: A past-due subscription prompts dunning
- **WHEN** a user's subscription is past due after a failed payment
- **THEN** the UI surfaces the dunning state with a link to the Customer Portal
