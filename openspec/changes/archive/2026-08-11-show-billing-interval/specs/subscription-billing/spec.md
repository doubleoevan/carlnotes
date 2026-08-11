## ADDED Requirements

### Requirement: The billing state carries the subscription's billing interval

The billing state the account page reads SHALL include the user's billing interval, taken from the same `billing_subscriptions` row that already resolves their daily scan limit. It SHALL NOT be stored a second time on the user row to save the read, because the interval is the stored fact overage-billability derives from and a copy is a value that can disagree with it.

A user with no subscription SHALL resolve as `monthly`, which is the key the limit lookup needs rather than a claim about how they are billed.

#### Scenario: A paid subscription reports its interval

- **WHEN** a yearly subscriber's billing state is loaded
- **THEN** it carries `yearly`, read from the same subscription row as their daily scan limit, with no additional query

#### Scenario: A free user resolves as monthly

- **WHEN** a user with no `billing_subscriptions` row has their billing state loaded
- **THEN** the interval resolves as `monthly` so the limit lookup has a key

### Requirement: The account page names a paid plan's billing interval

The account page's plan card SHALL name the billing interval alongside the plan for a paid plan, so a subscriber can read what they pay for and how often without opening the Customer Portal.

A free plan SHALL show no interval. It has no subscription, and its resolved `monthly` is a lookup default rather than a billing frequency, so naming it would state a charge the reader does not have.

#### Scenario: A paid plan names its interval

- **WHEN** a premium subscriber billed yearly views their account page
- **THEN** the plan card names both the plan and the yearly interval

#### Scenario: A free plan names no interval

- **WHEN** a free user views their account page
- **THEN** the plan card names the plan alone

### Requirement: The pricing page opens at the reader's own billing interval

The pricing page's monthly/yearly toggle SHALL open at the signed-in user's billing interval, so a subscriber sees the prices and limits they are actually on rather than having to find their own row.

A visitor and a free user SHALL open at monthly, which is already correct for them, and the page SHALL NOT read billing state on their behalf.

The toggle and the plan cards SHALL NOT be shown at one interval and then moved to another once the reader's interval is known. On a page whose content is prices, a card that changes after it is read is worse than one that arrives a moment later, and a toggle that is live before the interval lands can take a reader's click and then overwrite it.

#### Scenario: A yearly subscriber opens on yearly

- **WHEN** a yearly subscriber opens the pricing page
- **THEN** the toggle is on yearly and the cards show yearly prices and limits without the reader touching it

#### Scenario: A visitor opens on monthly

- **WHEN** a signed-out visitor opens the pricing page
- **THEN** the toggle is on monthly and no billing state is requested

#### Scenario: A free user opens on monthly

- **WHEN** a signed-in free user opens the pricing page
- **THEN** the toggle is on monthly and no billing state is requested

#### Scenario: The toggle and cards do not move after paint

- **WHEN** a paid subscriber opens the pricing page and their interval has not yet loaded
- **THEN** the toggle and the cards are withheld until it has, rather than rendering at monthly and switching

### Requirement: A pricing card is the current plan only at the matching interval

A pricing card SHALL be marked as the reader's current plan only when both the plan and the billing interval match their subscription. The same plan at the other interval is a different price, different limits, and a different Stripe subscription, so marking it current would name something the reader is not on.

A signed-in reader SHALL see no badge on a card that is not their exact subscription. The recommendation badge is for a visitor choosing a plan, and reads as advice to someone who has already chosen.

A card whose plan matches at a non-matching interval SHALL offer the Customer Portal action every other card offers a paying user, rather than an inert current-plan control. Switching interval is made in the portal, and that card is where a reader goes to make it.

#### Scenario: The matching card is marked current

- **WHEN** a premium-yearly subscriber views the pricing page with the toggle on yearly
- **THEN** the premium card is badged as their current plan and its action is inert

#### Scenario: The same plan at the other interval is not current

- **WHEN** that subscriber switches the toggle to monthly
- **THEN** the premium card carries no badge and its action opens the Customer Portal

#### Scenario: A signed-in reader sees no recommendation badge

- **WHEN** a signed-in user views a card that is not their current subscription
- **THEN** the card carries no badge at all
