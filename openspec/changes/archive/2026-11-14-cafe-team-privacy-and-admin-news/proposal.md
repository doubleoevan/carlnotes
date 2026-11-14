# Proposal

## Why

A person's Café and their news read the person's Teams by two different rules. The news hides a Team whose membership
the person hid, and the Café's tiles still show that Team's Topics to a visitor. The person's own table lists a
private Topic another member owns before its Personal sources text is converted, which the news leaves out. The table
does not say whose Topic a row is, the Team field does not say which Team is the default, and a save puts a Topic on
the default team without saying so. An admin checking someone's Café for QA sees their Topics but only the public
news, and no opener.

## What Changes

- **One membership rule.** One query returns a person's Teams for the Café and the news. Anyone but the person and an
  admin reads only public Teams that show the person's membership.
- **Unconverted private Topics.** The Café's tiles and the person's table leave out a private Topic another member
  owns until its Personal sources text is converted, as the news does.
- **Whose Topic.** The All Topics table on a profile shows an Owner column: the Team if the Topic is on one the reader
  may see named, or else the owner.
- **The default team.** The Team field marks the default team, and a save that adds a Topic to it says so in a
  message.
- **Admin view.** An admin reads anyone's whole news, followed Topics included, and the person's opener for the day
  from the cache, with no model call. A highlighted select in the news card switches the whole profile between the user
  view and the visitor view.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `public-profiles`: the Café's Team rule, unconverted private Topics, and the Owner column.
- `news`: one Team rule with the Café, and an admin's read of someone's news.
- `updates`: an admin reads a person's stored opener.
- `teams`: the default team's label in the Team field and its save message.

## Impact

- `apps/api`: the shared Team query, the Café reads, the news read, the profile's table rows, and the admin opener
  route.
- `packages/contracts`, `packages/client`, `packages/core`: the owner and team on a table row, the opener read, the
  Owner column, the Team field's label, the save message, and the profile's view select.
- `apps/web`, `apps/mobile`: each app's elements for the Owner column and the view select, and both profile pages' view.
