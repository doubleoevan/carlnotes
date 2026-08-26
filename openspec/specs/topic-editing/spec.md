# topic-editing Specification

## Purpose
TBD - created by archiving change add-topic-detail-and-edit-pages. Update Purpose after archive.
## Requirements
### Requirement: Editing happens in a modal, not a route
The ✎ icon SHALL open a centered edit modal over the dimmed topic page with an `Edit topic` title and a ✕ close. The same modal SHALL serve topic creation (titled `Add topic`) with empty fields, private daily defaults, and every registered default source switched on. The modal SHALL present, top to bottom: Title (text input), Carl's Prompt (textarea), Tags (pill editor with per-pill ✕ and a "+" that opens a search-and-create picker in the style of GitHub's label menu — a filter input over the tags known from the loaded feed, click-to-add rows, and a Create row for a typed tag that matches nothing), Frequency and Visibility as two side-by-side selects (daily/weekly; private/public/invite), Invitees (only when visibility is invite), Sources, Attachments, and a right-aligned Cancel/Save footer. The Sources field SHALL split into a default group — one row per kind in the shared default-Source registry, each labeled from that registry, removable when on and offered as a turn-on control when off, Carl's built-in web scout (`web`) among them — and a custom group listing the other sources with ✕ and an add picker offering the editable source kinds, including `podcast`, which takes a show's podcast id. The `/topics/:id/edit` route SHALL NOT exist.

#### Scenario: The modal opens from the pencil
- **WHEN** the owner activates ✎
- **THEN** the modal opens over the dimmed page pre-filled with the Topic's current fields, with the Title input focused and its text not selected

#### Scenario: Cancel discards everything
- **WHEN** the owner edits fields, stages an upload, and then cancels
- **THEN** nothing is persisted and the page payload is unchanged

#### Scenario: Creation stages every default source
- **WHEN** the modal opens for creation
- **THEN** the default group shows one row per registered default kind, web among them, each switched on

#### Scenario: A podcast is added by its podcast id
- **WHEN** the owner adds a `podcast` source and types a show's podcast id
- **THEN** it is staged as a custom source carrying that id, and the default group is unaffected

#### Scenario: A new topic starts on invite

- **WHEN** the owner opens the Add topic modal
- **THEN** visibility starts on invite with the invitee editor showing, and the owner may switch to private or public before saving

#### Scenario: A Google News source sits in the custom group
- **WHEN** the modal opens on a Topic holding a Google News Source
- **THEN** the default group shows only the web scout, and the Google News Source is listed among the custom sources as the publisher it covers

#### Scenario: Creation starts with the preselected Sources on
- **WHEN** the owner opens the modal to add a Topic
- **THEN** the default group shows every preselected kind switched on, and saving creates one configless Source for each that is still on

#### Scenario: A default source turns back on after being removed
- **WHEN** the owner removes a default source and then activates its turn-on control
- **THEN** that default source is staged again and saving restores it

#### Scenario: A Bluesky account is added as a custom source
- **WHEN** the owner picks bluesky in the add picker and enters an account handle
- **THEN** it is staged as a custom Bluesky Source carrying that handle, with any leading `@` stripped

#### Scenario: A new Topic is created with every default Source on
- **WHEN** the owner opens `Add topic` and saves without touching the Sources field
- **THEN** the created Topic holds one Source per member of the default Source set, and no `x` Source

#### Scenario: An X source is added by handle from the custom picker
- **WHEN** the owner opens the add picker, chooses `x`, and types a handle
- **THEN** a custom `x` Source is staged carrying that handle, with any leading `@` stripped, and it renders in the custom group with its `@handle` summary

#### Scenario: Turning one default Source off leaves the others on
- **WHEN** the owner removes a row from the default group and saves
- **THEN** the Topic keeps its other default Sources, holds no Source of the removed kind, and that row is offered as a turn-on control

### Requirement: Topic creation is capped per user
The api SHALL create a topic owned by the current user from the same validated payload as an update, inserting its invitees and sources, capped at the caller's billing-plan topic limit (Free 3, Plus 10, Premium 25) — the cap counts owned topics, so deleting one frees a slot. Requests past the cap SHALL be rejected, and the modal's staged attachments SHALL upload against the new topic's id after creation.

#### Scenario: A create past the topic cap is rejected
- **WHEN** a user already holding as many topics as their plan allows submits another
- **THEN** the api rejects it and no topic is created

### Requirement: Attachments are managed from the modal and downloadable from the page
The modal SHALL list the Topic's attachments each on its own row with a ✕ remove control, and offer controls to upload a file or add a url; uploads and url ingestion run the real pipeline (size/type validation, object storage, context generation — a url is fetched to markdown first) and removals delete the row plus best-effort the stored object. On the topic page, the info card SHALL offer attachment downloads only to the owner, streaming the stored object with its original filename.

A `ready` attachment's row SHALL also expose its generated context as editable text, since that context steers every later Scan for the Topic. Saving the modal SHALL persist an edited context, and a `pending` or `failed` attachment SHALL show its status instead of an editor, because it has no settled context to edit.

#### Scenario: Upload and removal apply on save
- **WHEN** the owner stages a PDF upload and removes an existing attachment, then saves
- **THEN** the new attachment appears on the page, the removed one is gone, and its object is deleted from storage

#### Scenario: An edited context is saved
- **WHEN** the owner edits a ready attachment's context text and saves the modal
- **THEN** the attachment's stored context is the edited text and the Topic's next Scan uses it

#### Scenario: A pending attachment offers no editor
- **WHEN** the modal lists an attachment still being processed or one that failed
- **THEN** its row shows that status rather than an editable context field

### Requirement: Deletion is its own confirmation dialog
The 🗑 icon SHALL open a small confirmation dialog separate from the edit modal, with the copy "Delete this topic? '{name}' and its {N} findings and {M} scans go with it." and Keep it / Delete topic (destructive) buttons. Confirming SHALL delete the Topic through the api authorized by `isAllowed(user, "topic:delete", topic)` — the owner or an admin (rows cascade, stored attachment objects best-effort deleted) — and return the user to the homepage.

#### Scenario: Delete confirms and navigates home
- **WHEN** the owner confirms the delete dialog
- **THEN** the Topic and its dependents are gone and the app navigates to the homepage

#### Scenario: An admin can delete any Topic
- **WHEN** an admin confirms deletion of a Topic they do not own
- **THEN** the gate allows it and the Topic and its dependents are gone

### Requirement: Max results is chosen in the edit modal
The edit-topic modal SHALL offer a "Max results" select with the options Carl's top 5, Carl's top 10, Carl's top 15, and Carl's top 20 — wording identical to the info card's row. A new topic defaults to Carl's top 10, an existing topic shows its stored value, and the api SHALL validate the saved value against the allowed set.

#### Scenario: The select round-trips
- **WHEN** the owner picks Carl's top 15 and saves
- **THEN** the reloaded topic stores `max_results` 15 and the modal and info card both show it

#### Scenario: An invalid value is rejected
- **WHEN** a save carries a max-results value outside 5, 10, 15, or 20
- **THEN** the api rejects the payload

### Requirement: Save applies the whole edit through the gate
Save SHALL apply the edit as desired state: one update call carrying the fields, the full invitee list, and the full source list (the api reconciles stored rows — kept by id, inserted without id, deleted when missing), then staged attachment uploads, then staged attachment removals. The api SHALL validate the payload (non-empty name, enum frequency/visibility, well-formed invitee emails, source kinds limited to the editable set: url, rss, reddit, youtube, search, and bluesky) and SHALL authorize the write through `isAllowed(user, "topic:edit", topic)`, which allows the owner or an admin and rejects everyone else. These steps SHALL run in sequence and are not one transaction: the field, invitee, and source update commits first, then staged uploads and removals apply independently, so a failure partway leaves the committed update in place with some attachments not yet uploaded or removed. The modal SHALL surface the error rather than roll back; because the update and reconciled lists are desired-state, re-saving reconverges them, and Cancel always discards staged-but-unsaved attachment changes.

#### Scenario: A field and source edit round-trips
- **WHEN** the owner renames the Topic, removes a source, adds an rss source, and saves
- **THEN** the reloaded page shows the new name and the reconciled source list

#### Scenario: An admin can update any Topic
- **WHEN** an admin saves an edit to a Topic they do not own
- **THEN** the gate allows it and the edit applies

#### Scenario: A non-owner cannot update
- **WHEN** a user who is neither the owner nor an admin sends an update for the Topic
- **THEN** the api rejects it as forbidden

#### Scenario: A bluesky source is accepted by validation
- **WHEN** a save carries a source of kind bluesky naming an account handle
- **THEN** the api accepts the payload and reconciles the source row

### Requirement: A Topic holds at most ten Sources

A Topic SHALL hold at most ten Sources. Every kind counts toward that limit, the built-in web search included, so a reader who turns web search off frees a slot for something else. Urls written into Carl's Prompt count too, since they become Sources on save, and leaving them out would make the prompt a way around the cap.

The limit SHALL be a flat constant in shared configuration, the same on every plan. It bounds what one Scan fetches, which is a cost every plan pays, and a Topic with fifty feeds is a worse Topic at any price.

The cap SHALL be enforced in the save validation the payload already passes through, beside its source-kind checks, so creating and updating are both covered by one rule rather than two.

#### Scenario: A save past the cap is rejected

- **WHEN** a save arrives holding eleven Sources
- **THEN** it is rejected and nothing about the Topic changes

#### Scenario: Web search occupies a slot

- **GIVEN** a Topic holding nine custom Sources and the built-in web search
- **WHEN** the reader turns web search off
- **THEN** the Topic has a free slot and one more Source may be added

#### Scenario: Prompt urls count toward the cap

- **GIVEN** a Topic at the cap
- **WHEN** the reader writes another url into Carl's Prompt and saves
- **THEN** the save is rejected, since that url would become a Source

#### Scenario: The cap does not vary by plan

- **WHEN** the cap is read for a free reader and for a premium one
- **THEN** it is the same number

### Requirement: The editor proposes Sources and shows when it is full

The edit modal SHALL offer a **Suggest sources** control that reads the Title and Carl's Prompt as they stand and adds what comes back straight to the staged-source list, each row removable with the ✕ already on it. Nothing SHALL be persisted until Save, so a suggestion the reader does not want costs them one click to drop.

The control SHALL be disabled until the Title or the Prompt has text, since neither the reader nor a model can propose Sources for a Topic that describes nothing yet.

While suggestions are on their way the control SHALL be replaced by a moving line drawn from the same set the chat shows while a reply is coming, so waiting reads as the product thinking instead of as a stalled button.

The modal SHALL ask only for the headroom the Topic has left — the lesser of three and the free slots — so it never offers what the Topic cannot hold.

At the cap, both **+ add a source** and **Suggest sources** SHALL be disabled and SHALL explain why in the product's own voice, in the treatment the frequency picker already uses for a limit, without its link to pricing. The cap is the same on every plan, so there is nothing to upgrade to and offering it would be a false promise.

When suggestions come back empty, the modal SHALL say so plainly rather than leaving the reader looking at an unchanged list wondering whether the click registered.

#### Scenario: A suggestion lands as a removable row

- **WHEN** the reader activates Suggest sources and the route returns two Sources
- **THEN** both appear in the staged-source list with their ✕, and neither is persisted until Save

#### Scenario: An empty Topic cannot ask

- **WHEN** the modal is open for a new Topic with no Title and no Prompt
- **THEN** Suggest sources is disabled

#### Scenario: Waiting reads as thinking

- **WHEN** suggestions are being fetched
- **THEN** the control is replaced by a moving line, and it returns when the suggestions arrive

#### Scenario: A nearly full Topic asks for what fits

- **GIVEN** a Topic holding nine Sources
- **WHEN** the reader asks for suggestions
- **THEN** at most one is requested and at most one is added

#### Scenario: A full Topic explains itself

- **GIVEN** a Topic at the cap
- **WHEN** the reader looks at the Sources field
- **THEN** both + add a source and Suggest sources are disabled and say why in the product's voice, with no link to pricing

#### Scenario: No suggestions says so

- **WHEN** every candidate was filtered or failed verification
- **THEN** the modal tells the reader nothing new was found, and the staged list is unchanged

### Requirement: A new invitation emails the invitee

Saving a public or invite Topic SHALL send one invitation email to each newly added address — on creation and on any edit that adds an address — and SHALL NOT email an address that was already on the list, so re-saving a Topic never re-emails it. An address invited again after being withdrawn is newly added and SHALL be emailed again. A private Topic has no invitees: only the owner can see it, so there is nobody to invite.

The email SHALL name the inviter by the Topic owner's Username (an admin's edit invites on the owner's behalf), name the Topic, and link to the topic page, where an invite Topic's gated notice carries a signed-out invitee through login or signup and back, and a public Topic simply opens. The link SHALL carry a `src` marker naming the invitation email, which the gate forwards as the signup's cta tag, so `signup_completed` counts invitations that converted. It SHALL say the invitation is tied to the invited address, since an invite Topic's access is keyed to it, and SHALL close by saying that ignoring the email changes nothing. It SHALL NOT subscribe anyone: the invitee subscribes for themselves from the topic page, as the invitee requirement already states.

Sending SHALL be fire-and-forget after the save commits: a failed send is logged and reported, never failing the save, and with no configured app url the email is skipped rather than sent without a link.

#### Scenario: A newly added invitee is emailed

- **WHEN** the owner saves a Topic with a newly added invitee address
- **THEN** that address receives an invitation naming the owner's Username and the Topic, linking to the topic page

#### Scenario: Re-saving does not re-email

- **WHEN** the owner re-saves a Topic whose invitee list is unchanged
- **THEN** no invitation email is sent

#### Scenario: The invitee subscribes for themselves

- **WHEN** an invitee follows the email link and signs up with the invited address
- **THEN** they land on the topic page with view access, and no Subscription exists until they subscribe there

#### Scenario: A public topic invites too

- **WHEN** the owner saves a public Topic with a newly added invitee address
- **THEN** that address receives the same invitation email, and the topic page opens for them without a gate

### Requirement: Default Sources come from one registry

The default Source set SHALL be one shared registry rather than a comparison against the `search` kind. Each entry SHALL name its key, the Source kind it saves as, the label and summary the UI shows for it, and how its config is built. The registry SHALL hold Carl's web scout (kind `search`, labeled `web`, configless) and SHALL be the single place both the edit modal and the topic info card read the default set from, so adding a default Source means adding an entry. A stored Source SHALL match a registry entry by its kind.

Google News SHALL NOT be a registry entry: it is a custom Source, because it needs a publisher that only its owner — or a later change that suggests news sources — can name.

#### Scenario: A new Topic preselects every default Source

- **WHEN** the modal opens to create a Topic
- **THEN** every registry entry is switched on, so the new Topic saves with the web scout and no other Source

#### Scenario: A default Source is removable

- **WHEN** the owner removes the web scout and saves a Topic that has other Sources
- **THEN** no `search` Source is stored and the default group offers it as a turn-on control

#### Scenario: The last remaining Source cannot be removed

- **WHEN** the owner removes the only Source the Topic has left, default or custom
- **THEN** the removal is refused with the same warning the editor already gives

#### Scenario: Saving writes one row per switched-on entry

- **WHEN** a Topic is saved with a registry entry switched on
- **THEN** exactly one Source of that entry's kind is stored, holding the config the entry builds

### Requirement: The custom source picker offers options, not source kinds

The picker SHALL list custom source **options** from one shared table rather than listing source kinds, because an option is not always a kind of its own. Each option SHALL name the kind it saves as, the label the picker and the staged row show, the placeholder its value input carries, and how it turns the typed value into a Source config. The table SHALL be the single place a custom Source's config is built, so the modal carries no per-kind config branch of its own.

The picker SHALL offer a `google news` option whose input is a publisher domain and whose kind is `rss`, alongside the `url`, `rss`, `reddit`, and `youtube` options. An option that cannot build a config from what was typed SHALL stage no Source.

#### Scenario: Google News is added from the picker

- **WHEN** the owner picks `google news`, types `techcrunch.com`, and saves
- **THEN** an `rss` Source is stored whose url is the Google News feed for that publisher, and the editor lists it as a custom Source

#### Scenario: The picker names what each option wants

- **WHEN** the owner selects an option in the picker
- **THEN** the value input carries that option's own placeholder, such as `publisher domain…` for `google news` and `feed url…` for `rss`

#### Scenario: A value the option cannot build from stages nothing

- **WHEN** the owner picks `google news` and types a value with no domain in it
- **THEN** no Source is staged and the rest of the save is unaffected

### Requirement: The default Source set is one registry

The Sources a new Topic starts with SHALL be one named set of source kinds that every surface reads, rather than a source kind named individually wherever defaults are decided. A source kind joins the set by being listed in it, and a Topic created from the editor SHALL be staged with one Source of every kind in the set, each configless. Each default kind SHALL carry its own display copy — a short label and a summary of what it does — so a default Source line reads as what it does rather than as its enum value. Every editable kind outside the set SHALL be offered in the custom add picker instead, where it names what to pull from.

#### Scenario: A new Topic starts with every default Source on

- **WHEN** the owner opens the modal to create a Topic
- **THEN** one Source per default kind is staged and shown as on, and saving creates them

#### Scenario: A kind outside the default set is offered as a custom source

- **WHEN** the owner opens the custom source add picker
- **THEN** it offers every editable source kind that is not in the default set, including bluesky

### Requirement: Invitees are editable for public and invite visibility

The Invitees field SHALL render while the modal's visibility is public or invite, hidden only while it is private: pills with ✕, an "add email and press enter…" input with an Invite button, a username field beside it that stages each entered username as a chip the save sends — an unknown one is refused by name when the invitations send, and no invite exists for it — and a helper line explaining that invitees are asked to subscribe and choose for themselves. Saved invitees SHALL be stored in `invites`. An invited email SHALL grant topic-page view access and a pending invite the invitee must accept before any subscription exists — saving an invitee SHALL never subscribe them or place the Topic in their view.

Invite links are handed out from the share menu's share-sheet row instead of this section, a deliberate scope cut. The webmail-composer menu lives on the team form's membership fields alone.

The section SHALL also list the links that are still good, each showing how much of it is left and a revoke button. The addresses stay the pills above, which are the same list under a different grant, so no address is shown twice.

#### Scenario: Switching visibility reveals the invitee editor

- **WHEN** the owner switches visibility from private to invite
- **THEN** the invitee editor appears, and saved emails persist to the invite list

#### Scenario: Saving an invitee does not subscribe them

- **WHEN** the owner saves a new invitee email
- **THEN** the invite is pending for that email's user, and no subscription row exists until they accept

#### Scenario: A compose button adds no invitee

- **WHEN** the owner opens a provider's composer from the invite section
- **THEN** a token is created and the composer opens prewritten, while the invitee list is unchanged

#### Scenario: The invite list distinguishes the two paths

- **WHEN** the owner views a Topic holding both an email invite and a link invite
- **THEN** the address is a pill in the invitee field and the link is a row under the compose buttons showing its uses left, each with its own way to withdraw it

#### Scenario: An unknown username never becomes an invitee

- **WHEN** the owner stages a username no account holds and saves
- **THEN** the save reports the refusal by name and no invite row exists

