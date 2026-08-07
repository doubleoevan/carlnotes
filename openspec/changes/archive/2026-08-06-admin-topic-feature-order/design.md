## Context

`topics.featureOrder` is an existing nullable integer. `api/topic/feeds.ts` selects public Topics with a non-null order and sorts ascending for the Featured section, and takes the null ones for Popular. The only thing that ever wrote it was `FEATURE_ORDER` in `db/seed.ts`.

So the column, the read path, and the rendering all existed. What was missing was a writer and the invariant that makes the positions mean anything.

## Goals / Non-Goals

**Goals:**

- An admin can arrange the Featured section from any public Topic's own page, seeing the section as it stands while doing it.
- Feature orders are always the contiguous whole numbers 1..n, one Topic each.
- A Topic that leaves the public set takes its position with it and closes the gap.

**Non-Goals:**

- Changing how the Featured section is queried, ordered, capped, or rendered. In particular, Featured and Popular still exclude the viewer's own Topics, so an admin does not see their own ranked Topics in their own Featured section — they appear under "Your topics", while every other reader sees them in Featured.
- Featuring a Topic that is not public.
- A bulk reordering screen in the admin console. The control is per-Topic, on the Topic.
- Backfilling the seeded orders. `db/seed.ts` already writes a contiguous 1..3.

## Decisions

### The position rules are one function over a contiguous list

Every operation — insert, move, clear, release on delete, release on visibility change — is the same two steps: take the Topic out of the ordering if it is in it, then put it back at a position if it has one. That collapses to a single `setTopicFeatureOrder(topicId, position)` plus a `releaseFeatureOrder(topicId, handle)` that is the first half alone.

Written as SQL updates inside a transaction rather than as a read-modify-write over the rows: decrement everything below the old position, then increment everything at and after the new one. A read-modify-write would need every featured Topic in memory and would race a concurrent rank.

*Alternative considered*: a fractional or sparse ordering (insert at 1.5) to avoid shifting rows. Rejected — the control offers whole positions and the spec demands contiguity, so the shift has to happen anyway.

### The append position is clamped, not trusted

The menu offers one position past the end. For a Topic already featured, that offer is made while the Topic is still in the list — but by the time the position is applied the Topic has been released, so the ordering is one shorter and the offered position is one too far. Applying it literally would leave a gap where the Topic used to be.

`toTargetPosition(position, featuredCount)` clamps to `featuredCount + 1` after the release. It is the one piece of arithmetic in this change that is not SQL, and the only piece worth a unit test.

The UI disables that row for an already-featured Topic, so the clamp is normally unreachable from the control — but it stays as the backstop for a direct route call.

### The menu lists Topics, not bare numbers

A bare list of positions asks the admin to remember what is at each one. Listing each position with the Topic holding it makes the choice read as "put this one above that one", which is the decision actually being made.

That means the payload carries the featured Topics themselves — id, name, and order — rather than a count. The count is then just the list's length. Both this and the Topic's own `featureOrder` are null for anyone who is not an admin, the shape `monthCost` already uses.

### Every row releases its own Topic, so there is no zero position

An earlier draft offered position `0` to mean "not featured". Once each row carries an ×, that row's × already clears the Topic on it — including the Topic being viewed, whose own row is marked. A `0` row would be a second control for the same thing, so it was dropped.

`0` remains the wire value for "clear", since the route needs one, and the × sends it. It is simply never a row in the menu.

### The route authorizes on the server, and owns the public check

The control being hidden is not the protection. The route runs through the same `isAllowed` gate the admin console's role and budget routes use, under a new `admin:setFeatureOrder` capability.

The public-Topic check lives in `setTopicFeatureOrder` rather than in the route, so the route does not reach into the database itself and the rule cannot be skipped by a second caller. The function returns which rule refused, and the route maps that to a status.

### Release happens inside the existing transactions

`updateTopic` already runs in a transaction and the release joins it. `deleteTopic` did not, so the release and the delete are wrapped in one, so a Topic can never be gone from the public set while its old position is still occupied.

`updateTopic` releases when the visibility moves off public. Moving back to public does not restore anything — the order is gone and an admin ranks it again, which is the only behavior that keeps contiguity honest.

## Risks / Trade-offs

- **Two admins ranking at once** → The shifts are SQL updates in a transaction, so neither can read a stale list and write a duplicate. The later one wins and the result stays contiguous.
- **A shift touches every featured row below the position** → The Featured section is a curated handful, not a large table, so the write is small. If it ever grows, the sparse-ordering alternative is still open.
- **An admin ranks their own Topic and does not see it move** → Featured excludes the viewer's own Topics, so the change is invisible in their own feed while being correct for everyone else. Verified live: a signed-out visitor sees all four ranked Topics in order. Named here because it reads as a bug and is not one.
- **Seeded data could disagree with the invariant** → `db/seed.ts` writes 1, 2, 3 contiguously, so it already satisfies it. A database whose orders were edited by hand into a non-contiguous state is normalized by the next rank, not detected.

## Open Questions

None.
