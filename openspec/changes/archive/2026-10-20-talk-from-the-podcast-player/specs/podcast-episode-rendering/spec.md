## MODIFIED Requirements

### Requirement: A free Topic keeps only its latest short Podcast Episode

A Topic whose owner is on the free plan and is not an admin SHALL record a short Podcast Episode after every Scan that
succeeds with Findings to narrate, until the billed user's spend passes the Podcast Episodes cutoff of the
monthly-budget-cutoffs capability. A Topic on a paid plan SHALL record a short Podcast Episode the same way once the
billed user's spend passes the full Podcast Episodes cutoff. Its row SHALL be marked short when the Podcast Episode is
planned. The Topic SHALL record one short Podcast Episode at a time: a Scan that succeeds while the Topic has a
recording short Podcast Episode SHALL record none and spend nothing, and its Findings SHALL wait for the next Podcast
Episode. Publishing a short Podcast Episode SHALL replace every other published short Podcast Episode of the Topic in
the same transaction, so the Topic never has two published short Podcast Episodes and never has none between them.
Full Podcast Episodes that the Topic published while its owner was on a paid plan SHALL never be replaced. A replaced
Podcast Episode SHALL be removed the way an owner removes one, with its audio, script, and listen state deleted and its
row kept as `removed` with its season, its number, and its cost, except that its chapters SHALL be kept so its Findings
still count as narrated. A failed Podcast Episode SHALL NOT be replaced.

#### Scenario: A new short Podcast Episode replaces the last one

- **GIVEN** a free Topic with a published short Podcast Episode number 3
- **WHEN** the Topic's next Scan succeeds and its Podcast Episode publishes as number 4
- **THEN** number 3 is gone from the player, the episodes card, and every feed, its audio url responds as missing, and
  number 4 is the Topic's only published Podcast Episode

#### Scenario: A brew during a short recording gets no Podcast Episode

- **GIVEN** a free Topic whose short Podcast Episode is still recording
- **WHEN** another Scan of the Topic succeeds with new Findings
- **THEN** that Scan records no Podcast Episode and spends nothing on one, and its new Findings are not narrated yet

#### Scenario: A replaced Podcast Episode's cost still counts

- **WHEN** a short Podcast Episode that cost $0.19 is replaced
- **THEN** the billed user's monthly spend still includes the $0.19

#### Scenario: A paid Topic keeps every Podcast Episode

- **GIVEN** a Topic whose owner is on a paid plan and short of the full Podcast Episodes cutoff, with three published
  full Podcast Episodes
- **WHEN** its next full Podcast Episode publishes
- **THEN** all four stay published

#### Scenario: An owner who moves to the free plan keeps their full Podcast Episodes

- **GIVEN** a Topic with ten published full Podcast Episodes whose owner moved from plus to free
- **WHEN** the Topic's first short Podcast Episode publishes, and then its second
- **THEN** the ten full Podcast Episodes stay published, and the second short Podcast Episode replaces the first

#### Scenario: An owner who upgrades keeps their last short Podcast Episode

- **GIVEN** a free Topic with a published short Podcast Episode whose owner moved to plus
- **WHEN** the Topic's next Podcast Episode publishes as a full one
- **THEN** both stay published

## REMOVED Requirements

### Requirement: Podcast Episodes pause once monthly spend passes the plan's share of the budget

**Reason**: One share per plan becomes a ladder of cutoffs, so Podcast Episodes turn short before they pause, and they
pause at 20, 75, or 85 percent instead of 50 or 80.

**Migration**: The pause moves to "Podcast Episodes go short, then pause, at their cutoffs" in the
monthly-budget-cutoffs capability.
