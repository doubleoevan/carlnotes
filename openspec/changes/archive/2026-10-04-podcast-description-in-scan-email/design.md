## Context

The scan email waits for the Podcast Episode's outline before it sends. The outline call writes the title and the
description to the episode's row, and the email reads the row.

## Goals / Non-Goals

**Goals:**
- Show each scan email's podcast episode with the same description that a podcast app shows.

**Non-Goals:**
- No change to how the outline writes the description, and no change to the feed.

## Decisions

- The summary sits under the cover, beneath an "Episode summary" heading in the card's label style. "Show" names the
  whole podcast in a podcast app, so the heading says episode.
- The email leaves out the note that the hosts are AI voices. The feed, the player, and the episode page keep it, since
  those are where the voices are heard.

## Risks / Trade-offs

- An episode whose outline has not settled when the email's wait runs out has no description, and its section shows
  the title alone, as before.
