## Why

A public topic page's structured data lists each Finding of the topic's last scan with its title, link, and relevance explanation. A Finding that review kept without an explanation goes out with `"description": ""`: on production, 15 of the Findings on public topics have one, 8 of them on a single topic. An empty description tells a crawler nothing and reads as a missing field. The structured data is read only by machines, so leaving the empty field out changes nothing a user sees, and the visible page stays the same for users and crawlers alike.

## What Changes

- `toFindingListLd` in `api/seo.ts` leaves `description` out of a `ListItem` whose relevance explanation is empty, and keeps every other field and every item.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `seo`: a Finding in a topic page's `hasPart` ItemList includes its relevance explanation only when it has one.

## Impact

- `api/seo.ts` and its test. No visible page, api response, or MCP result changes.
