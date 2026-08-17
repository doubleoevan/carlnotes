## ADDED Requirements

### Requirement: A Bluesky account is suggestible and verified like any other Source

The suggestion flow SHALL offer `bluesky` accounts alongside the other editable source kinds, and its prompt SHALL state what a Bluesky value is — an account handle, which is a domain name — and that what the Source reads is the articles the account links to rather than its posts, so an account that mostly shares links is worth proposing and one that mostly talks is not.

A suggested account SHALL be verified before it is offered, through the same credential-free appview read its ingester uses, asking for a single post rather than a scan's worth. An account the appview refuses SHALL be dropped, since a model inventing a plausible-sounding handle is the failure this catches. A refusal that is a rate limit or a server error SHALL keep the suggestion, as it already does for every other kind, because that is the host declining to answer rather than saying the account is not there.

#### Scenario: A real account is offered

- **WHEN** the model proposes a `bluesky` account that exists
- **THEN** the appview serves its posts and the account is offered to the owner

#### Scenario: An invented handle is dropped

- **WHEN** the model proposes a plausible-sounding handle for an account that does not exist
- **THEN** the appview refuses it and the suggestion is dropped rather than offered

#### Scenario: A throttled check keeps the suggestion

- **WHEN** verifying a suggested account is rate limited or meets a server error
- **THEN** the suggestion is kept, the same as for every other source kind

### Requirement: A Bluesky account and a feed on the same domain are different Sources

Suggestion identity SHALL key a `bluesky` account on its handle, lowercased and without any leading `@`, so the same account written differently is one Source. It SHALL NOT key an account by its host the way a feed is keyed: a handle is usually the publication's own domain, so keying both the same way would read a Topic that follows a site's feed as already following its account, and suppress a suggestion that is genuinely a different thing to read.

#### Scenario: One account however its handle was written

- **WHEN** the same account is written with a leading `@`, or in different case
- **THEN** both resolve to one identity, so it is never suggested to a Topic that already has it

#### Scenario: An account is not its website's feed

- **WHEN** a Topic already follows a publication's rss feed and the model proposes that publication's Bluesky account
- **THEN** the two hold different identities and the account is still offered
