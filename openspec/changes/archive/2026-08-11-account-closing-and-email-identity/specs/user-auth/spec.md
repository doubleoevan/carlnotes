## ADDED Requirements

### Requirement: One mailbox reaches one account however its address is written

Gmail ignores dots in the local part and everything after a `+`, and treats `googlemail.com` as the same mailbox as `gmail.com`. One mailbox can therefore be written many ways, and matching an incoming address against a stored one is string equality.

The system SHALL canonicalize an email address before Better Auth looks a user up by it or stores it. Canonicalizing SHALL lowercase every address, and for a Gmail-family address SHALL additionally drop the dots, drop everything from the first `+`, and fold `googlemail.com` onto `gmail.com`. No other domain SHALL be treated as dot-insensitive, since that is not a general rule of email.

Canonicalizing SHALL apply on every path carrying an address, both those that look a user up and those that store one, and on the OAuth providers' profiles alike. Canonicalizing only one side would leave a stored address unmatchable by the incoming one.

Because every write stores the canonical form, a stored address SHALL already be canonical, so plain equality matches.

#### Scenario: A dotted variant does not create a second account

- **WHEN** an account exists for a Gmail mailbox and someone signs up with the same mailbox written with different dots
- **THEN** the signup is rejected as already existing and no second account is created

#### Scenario: A +tag variant does not create a second account

- **WHEN** an account exists for a Gmail mailbox and someone signs up with the same mailbox written with a `+tag`
- **THEN** the signup is rejected as already existing and no second account is created

#### Scenario: The googlemail twin does not create a second account

- **WHEN** an account exists for a `gmail.com` mailbox and someone signs up with the same local part at `googlemail.com`
- **THEN** the signup is rejected as already existing and no second account is created

#### Scenario: Any variant signs in

- **WHEN** a user signs in with any way of writing the mailbox their account was created with
- **THEN** they reach that same account

#### Scenario: A non-Gmail address is only lowercased

- **WHEN** an address at any other domain is canonicalized
- **THEN** it is lowercased and its dots and `+` are left alone

## MODIFIED Requirements

### Requirement: A password is long enough and not already leaked

A password SHALL be at least 12 characters and SHALL be refused when it appears in a known-breach corpus. No composition rule SHALL be imposed.

The breach check SHALL run only on the paths that set a password: signup, reset, change, and set. It SHALL NOT run on sign-in. Better Auth hashes on its sign-in failure paths purely to spend the time a real verify costs, so refusing a breached password there would answer a stranger differently for an address that is registered than for one that is not, which is a worse leak than the timing it defends.

The breach lookup SHALL fail open: when the corpus is unreachable, a password meeting the length floor is accepted and the failure is logged.

#### Scenario: A breached password is refused

- **WHEN** a user sets a password that appears in the breach corpus
- **THEN** it is refused

#### Scenario: An unreachable corpus does not block the password

- **WHEN** the breach lookup fails
- **THEN** a password meeting the length floor is accepted and the failure is logged

#### Scenario: Sign-in answers the same whether or not the account exists

- **WHEN** a breached password is offered at sign-in, once for a registered address and once for an address with no account
- **THEN** both are refused the same way, and neither reveals which address is registered
