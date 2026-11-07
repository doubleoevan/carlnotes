## MODIFIED Requirements

### Requirement: Premium API credentials are revocable and shown once

Premium users SHALL create per-user `cnk_v1_` API credentials on the account page, with a public ID and 256-bit random
secret. Only a digest and display metadata SHALL be stored. The secret SHALL be shown once. Revocation SHALL delete the
credential, which immediately prevents further sends, and entries it already sent SHALL stay under the label "API key".

#### Scenario: A credential is created and listed again
- **WHEN** an entitled user creates a key and later reloads the account page
- **THEN** creation shows the full key once and later reads show only label, public ID, redacted suffix, and dates
- **AND** neither storage nor logs contain the secret

#### Scenario: A user downgrades or revokes
- **WHEN** a key is revoked or its owner loses the capability
- **THEN** subsequent API sends fail without storing content
- **AND** the owner can still revoke keys and read/delete existing entries
- **AND** a revoked key no longer appears on the account page
