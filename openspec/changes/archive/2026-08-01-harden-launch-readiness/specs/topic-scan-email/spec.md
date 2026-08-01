## MODIFIED Requirements

### Requirement: The email lists each new Finding grounded in the Scan's data

The email SHALL be grounded only in the Scan's real new Findings: a subject naming the Topic, and content listing each new Finding's title, a link to its Resource URL, and its relevance explanation. It SHALL NOT fabricate Findings or include Findings from other Topics or from prior Scans.

The scan recap card SHALL render through the hardened markdown subset `injection-defense` requires — bold, lists, and headings render, a citation of one of this email's own Finding urls renders as a real link, and every other link, image, or piece of raw HTML is neutralized into inert text — and each Finding's relevance explanation SHALL render as plain text. Every anchor the email carries therefore points where the email already points: the Finding cards' Resource links and the unsubscribe link, so a model that read an attacker's page cannot point the inbox anywhere new.

#### Scenario: The content lists the new Findings and nothing else

- **WHEN** the email is built for a scheduled Scan's new Findings
- **THEN** the content lists each of those Findings' title, Resource link, and relevance explanation, and includes no Findings from other Topics or earlier Scans

#### Scenario: The recap links only to this email's own findings

- **WHEN** the Scan's recap cites one of the email's Finding urls and also links elsewhere, or a relevance explanation contains link syntax
- **THEN** the kept citation renders as a real link, everything else shows as inert text while the recap's formatting still renders, and every anchor in the email points at a Finding's Resource url or the unsubscribe link
