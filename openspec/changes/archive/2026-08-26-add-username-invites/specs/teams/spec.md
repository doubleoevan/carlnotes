## MODIFIED Requirements

### Requirement: One Team icon, three entry points, one create modal

A Team SHALL be represented by the Lucide Users icon everywhere one appears — the header menu item, the Team Up button, the teams index, the team badge on a Topic, and the team page header — and no second team icon is introduced.

The topic page's action row SHALL hold exactly one button on each end. The right end is the page's one call to action, picked in this order: Brew for whoever may scan, Join Team for a viewer on none of the Teams holding the Topic, Follow for a signed-out visitor, and Team Up for everyone else. The left end holds Team Up where it renders, and Share where nothing else claims the side. Following SHALL never be a second button on the left. It is either the call to action or a row in the search bar's actions menu, which keeps the row to one control a side on a narrow screen. Share SHALL appear in that menu whether or not the Share button renders, directly above Edit, and the follow row leads the menu. Team Up renders for any signed-in viewer, except an outsider on a private Topic, which stays its owner's alone to hand over. Toggling follow from either place SHALL confirm with a toast naming the Topic. On an unheld Topic it opens the create modal — two lines on what a Team gives, shared editing and a room with Carl, then attach to a Team the viewer leads or create a new one with the name prefilled from the Topic. On a held Topic its icon fills for a leader of any holding Team, whose menu lists each led holding Team with a remove X and each other led Team as an "Add to <team>" row behind a plus, sharing the Topic in; every other viewer keeps the plain attach view.

The topic create and edit form SHALL offer a Team field to the same viewers Team Up serves: no team, one of the teams the viewer leads, or a new team created on save with the saved topic attached. The new team's draft opens in place with a name, its Members fields, and the Public toggle; a draft left unnamed creates nothing, and the topic saves on its own. On a topic whose owning team the viewer leads it offers that team or no team; on one owned by a team the viewer does not lead it stays hidden. The picked destination applies after the topic saves, and a failed attach keeps the saved topic and says so.

A teams index SHALL live behind a Teams item in the header menu directly below Profile, listing the viewer's Teams with their role in each and who invited them — the viewer's own profile when nobody did — beside a New Team button and the only leave button, governed by the last-leader rule. A pending team invitation SHALL render as an inactive row of the same table: its role reads invited, Invited by names the sender, the member and topic counts open the same members and topics subtables a membership row has, read-only, so an invitee can look before joining, the spend shows like a membership's, and the Active toggle joins — its tooltip reads "Join <team>" — while the X declines. A membership's toggle leaves with a "Leave <team>" tooltip, except for a team's only leader, whose toggle reads "Assign a new leader to leave" and opens the members subtable instead of toggling. When the viewer belongs to no teams, the index SHALL offer a call-to-action line that opens the create modal, in the shape the activity page's empty topics section uses. A Team created from any entry point appears there immediately. Creating from the index offers a multiselect of the Topics the viewer may bring — their own at any visibility first, then every public Topic and the invite Topics they can read, each group alphabetical, with a Topic held elsewhere offered too since attaching shares it in — and suggests a name instead of presenting an empty field. Every entry point SHALL share one modal, differing only in prefill and multiselect.

The team form SHALL offer a username field beside its email field, staging each entered username as a chip the save sends; when the invitations send on save, a refused one — unknown username included — is reported by name and no invite exists for it.

#### Scenario: The action row holds one button a side

- **WHEN** the topic page renders for an owner, a team member, a signed-in outsider, and a signed-out visitor
- **THEN** each of them sees exactly one button on the left and one on the right, with following in the actions menu wherever it is not the call to action

#### Scenario: A Topic a Team holds offers the way in

- **WHEN** a viewer on none of a Topic's holding Teams opens its page and the owning Team is public
- **THEN** Join Team is the right-hand call to action, Follow moves into the actions menu, and the Share button gives the left to Team Up or stands in itself

#### Scenario: The picker leaves out only what the team holds

- **WHEN** the create modal offers Topics to attach
- **THEN** only Topics the target team already holds are absent from the multiselect, and a Topic held by other teams alone is offered

#### Scenario: One modal serves every entry point

- **WHEN** a Team is created from the topic page and from the index
- **THEN** the same modal ran both times, differing only in the Topic prefill and the multiselect, and the new Team lists on the index at once

