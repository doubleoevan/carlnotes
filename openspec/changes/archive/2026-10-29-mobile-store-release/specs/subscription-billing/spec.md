# Spec Delta

## ADDED Requirements

### Requirement: The app's first store release offers no purchase

Until a storefront design is approved, the mobile app SHALL offer nothing for sale: no checkout, no billing portal,
and no link or call to action that leads to either. The app SHALL keep showing the user's plan, usage, and
entitlements, the plans and their limits read-only, the failed-payment notice as text, Terms, Privacy, and Close
your account. The web's checkout and portal SHALL be unchanged.

#### Scenario: A free user opens Account in the app

- **WHEN** a free user opens the app's Account screen
- **THEN** the plan badge and the usage meter show, and no Upgrade or Manage plan control shows

#### Scenario: The budget is spent in the app

- **WHEN** the app shows a budget or Topic-limit notice
- **THEN** the sentence shows in Carl's words with no plans link and no purchase call to action

#### Scenario: A paying user's card fails

- **WHEN** a paying user with a failed payment opens the app's Account screen
- **THEN** the failed-payment sentence shows with no portal button

#### Scenario: The web is unchanged

- **WHEN** a user opens the web's Plans or Account page
- **THEN** checkout and the portal work as before

### Requirement: A guard keeps purchase paths out of the app's reach

Preflight SHALL fail when the mobile app reaches the checkout or portal capability, through its own imports or the
shared packages, or when a module the app reaches contains a plans path or a purchase label, except the exceptions the
guard lists with a reason: the read-only Plans screen and the modules that map, route, or return to it.

#### Scenario: An app file regains a purchase link

- **WHEN** a file under `apps/mobile` gains a plans link
- **THEN** preflight fails and names the file

#### Scenario: A listed exception passes

- **WHEN** the Plans screen and the modules that map and route to it are the only plans paths the app reaches
- **THEN** preflight passes
