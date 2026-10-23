## REMOVED Requirements

### Requirement: A finding's viewer count counts people

**Reason**: A Finding's note and the Trending sort read how often a Finding is opened, so a Finding counts views again,
and a Topic keeps counting the people who view it. The requirement added below holds the rule.

**Migration**: `findings.view_count` is read and written again, backfilled from `finding_views`, and
`findings.viewer_count` stays in the database unread and unwritten until a later release drops it.

## ADDED Requirements

### Requirement: A finding's view count counts every open

`findings.view_count` SHALL be the number of times people have opened the Finding from the app, every open counted. A
signed-in person's open SHALL also add a `finding_views` row and mark the Finding read for them. A visitor's open SHALL
count only if it comes from the app's own origin, from a browser and not a crawler or a link unfurler, within the
per-address count rate limit, on a Finding a visitor may see, and it SHALL record nothing else. The view route SHALL
return 204 to a visitor in every case, so the response never says whether the Finding exists. The migration SHALL
backfill the count from `finding_views` as the opens it holds, keeping a larger count from before `finding_views`
recorded opens. `findings.viewer_count` SHALL stay in the database, unread and unwritten, until a later release drops it
once no process that counts Finding viewers runs. `finding_views` SHALL keep its one row per signed-in open.

#### Scenario: A second open by the same person counts again

- **WHEN** a signed-in person opens a Finding twice
- **THEN** its `view_count` rises by two and `finding_views` holds two rows

#### Scenario: A visitor's open counts a view

- **WHEN** a visitor opens a Finding on a public Topic from the site
- **THEN** its `view_count` rises by one, the route returns 204, and no `finding_views` row is written

#### Scenario: Another website's open counts nothing

- **WHEN** a page on another website posts a view of the Finding
- **THEN** the route returns 204 and `view_count` is unchanged
