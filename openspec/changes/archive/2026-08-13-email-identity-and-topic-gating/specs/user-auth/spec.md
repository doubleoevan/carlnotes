## ADDED Requirements

### Requirement: A signed-in user can change their email

A signed-in user SHALL be able to change the email on their account from the account page. The change SHALL take two links: one sent to the current address, authorizing the move, and only once that is confirmed does a second link go to the new address, proving it is reachable. Neither link alone SHALL move the account.

The reply to a change request SHALL be the same whether or not the requested address already belongs to another account, so nothing here reveals which addresses are registered.

#### Scenario: Changing an address requires both links

- **WHEN** a signed-in user requests a change and follows only the link sent to their current address
- **THEN** the account's email has not changed until the second link, sent to the new address, is also followed

#### Scenario: A hijacked session cannot silently relocate the account

- **WHEN** a change of address is requested
- **THEN** the confirming link goes to the current address, not the new one, so the account's real owner sees the request before anything moves

#### Scenario: An address already in use answers the same as one that is not

- **WHEN** a change is requested to an address that already belongs to another account
- **THEN** the response is indistinguishable from a request to an address with no account

### Requirement: A Turnstile token is renewed after a failed submission

A Cloudflare Turnstile token is spent the first time it is checked, whether or not the request it accompanied succeeds. A form gated by Turnstile SHALL request a fresh token after any submission that fails for a reason other than the token itself, so the visitor can retry without reloading the page.

#### Scenario: A password rejected for its own reasons still allows a retry

- **WHEN** a signup or reset-request form is submitted with a valid Turnstile token and the request is rejected for an unrelated reason (a weak password, a taken address)
- **THEN** the widget issues a fresh token in place of the spent one, and the form can be resubmitted without a page reload
