## ADDED Requirements

### Requirement: The topics table counts the emails a topic sent

Every email a Topic sends that Resend accepts — a scan delivery, a manual-scan report, an invitation — SHALL be recorded as one send row for that Topic with its recipient's user id, null for an invitee with no account. A send Resend refuses or that is skipped SHALL record nothing, so the log only says what actually went out. A deleted Topic's send rows go with it, and a closed recipient account leaves the row without naming anyone.

The topics table SHALL carry a sortable `Emailed` column beside the Emails toggle: the sends the Topic's owner received this month, on the same month grain as Brews and Cost, with a tooltip saying so and its sum on the totals line as `N sent`. A send to anyone else — a subscriber's scan delivery, an invitation, a report to an admin who ran the scan — stays in the log and out of the column. The column SHALL stay a count and the Emails cell a control, never merged into one cell. The admin page's per-user subtable shows the same column through the same table.

Every totals-row figure on the page's tables SHALL carry its noun, so a footer reads without its headers: `16 brews`, `0 followers`, `300 read`, `182 kept`, `4 invited`, `1 subscribed`. A toggle column's total SHALL read as its on-share of the rows — `N/M on` under Emails, `N/M active` on the subscriptions table — and the topics totals line also counts `N public` under Visibility beside the existing `N daily` under Schedule. Money keeps its bare dollar figure, which labels itself.

#### Scenario: An accepted send to the owner counts

- **WHEN** a scan email or manual-scan report to the Topic's owner is accepted by Resend
- **THEN** the Topic's Emailed count for the month rises by one

#### Scenario: A send to somebody else is logged but not counted

- **WHEN** a scan email reaches another subscriber, an invitation reaches an invitee, or a report reaches an admin who ran the scan
- **THEN** the send is recorded with its recipient and the Emailed count is unchanged

#### Scenario: A refused send does not count

- **WHEN** Resend refuses a send, or the send is skipped for missing configuration
- **THEN** the Emailed count is unchanged

#### Scenario: The totals line sums the column

- **WHEN** the topics table renders with topics that emailed this month
- **THEN** the totals line shows the sum of every topic's Emailed count as `N sent`, not just the visible page's, with `N public` under Visibility and `N on` under Emails

### Requirement: The page says whose it is and goes read-only when it is not the reader's

The Activity page SHALL carry an identity row under its heading — the subject's avatar and username, linking to their profile — and the payload SHALL name whose activity it holds. The Account page SHALL carry the same row.

An admin reading another user's page SHALL get every figure and table read-only: the email and active toggles disabled, the delete and withdraw controls absent, the empty-state calls to action replaced with plain lines, and the account page's portal buttons and settings absent, since every one of those controls only ever acts on the caller's own rows.

The invitations table's Invitee cell SHALL show the invitee's avatar and username once the invited address has an account — opening their profile in a new tab, tooltip `<username>'s profile` — and the bare address until then.

#### Scenario: The identity row names the subject

- **WHEN** an admin opens another user's Activity or Account page
- **THEN** the heading carries that user's avatar and username, linking to their profile

#### Scenario: A foreign page has no live controls

- **WHEN** an admin reads another user's Activity page
- **THEN** every toggle is disabled and no delete, withdraw, or create control renders

#### Scenario: An invitee with an account shows as themselves

- **WHEN** an invited address belongs to an account
- **THEN** its row shows that user's avatar and username, opening their profile in a new tab
