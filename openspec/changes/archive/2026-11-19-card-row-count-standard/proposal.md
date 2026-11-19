## Why

The home's and the profile page's card sections move their count right after the title while their cards end short of
the far right. The topic page's Coffee Break Cinema draws its own title row and kept its count at the far right, so two
films on a wide screen left the count floating far from the cards. The rule belongs to every card row, so it moves into
Nightshift with the card grid it depends on.

## What Changes

- Nightshift's `cardGrid.ts` holds the web card grid's classes and `toCountBesideTitleFrom`, the width from which a
  row of that many cards ends short of the far right.
- The web's shared card section and the topic page's Coffee Break Cinema both read it, so Coffee Break Cinema's count
  sits right after its theme song credits while its cards end short of the far right.
- The topic page's collapsible section takes the same `countBesideTitleFrom` width as the home's accordion section.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: the card section count rule covers every web card row, the topic page's Coffee Break Cinema
  included, and Nightshift owns it.

## Impact

- `packages/nightshift/cardGrid.ts` (new), `apps/web/src/components/common/CardsSection.tsx`,
  `apps/web/src/components/topic/CollapsibleSection.tsx`, `apps/web/src/components/podcast/TopicVideoSection.tsx`.
- A two-film story in both apps. The mobile app stacks its cards in one column, so its count stays at the far right.
- No api, contract, MCP, or analytics change.
