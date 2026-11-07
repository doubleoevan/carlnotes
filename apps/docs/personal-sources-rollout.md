# Personal sources rollout

Keep production email receiving off until controlled manual-forwarding checks pass. Receiving must be configured for the
mailbox in `RESEND_FROM_EMAIL`, the same address topic scan emails come from. Development uses `Carl
<carl-dev@updates.carlnotes.com>` with receiving verified on `updates.carlnotes.com`. The planned production sender is
`Carl <carl@updates.carlnotes.com>`; production configuration is a separate rollout action. Unit tests cannot establish
live delivery, provider retention, or filing replies. The owner has no Outlook account, so Outlook remains unverified.

## Required configuration

- Keep `PERSONAL_SOURCES_RECEIVING_ENABLED=false` and `PERSONAL_SOURCES_EMAIL_ENABLED=false` until deployment validation completes.
- Set the existing `CHAT_TEXT_KEY` to a stable base64-encoded 32-byte key in API and worker configuration. Personal sources text,
  derived context, private Finding annotations, and pending reply snapshots use the same authenticated encryption format as private chat. Do not rotate
  this key without a compatible data migration. Keep `BETTER_AUTH_SECRET` stable for keyed retry and URL fingerprints.
- In Resend, configure receiving for the domain of `RESEND_FROM_EMAIL`. Use the provider’s required records, while preserving existing mailbox delivery, outbound DKIM, and SPF. Do not replace support-mail MX records without an explicit domain-routing plan. A provider-owned test sender is not an owned receiving mailbox.
- Give `RESEND_API_KEY` Resend's **Full access** permission to retrieve received emails. **Sending access** cannot
  retrieve them and returns `401 restricted_api_key`. Keep the credential in Doppler and restart both the API and
  Temporal worker after changing it. Resend documents the distinction in its [API-key permissions](https://resend.com/changelog/new-api-key-permissions).
  Configure `email.received` at
  `https://carlnotes.com/api/webhooks/resend/inbound`, or `https://resend-dev.carlnotes.com/api/webhooks/resend/inbound`
  for development. Run `cloudflared tunnel route dns carlnotes-dev resend-dev.carlnotes.com` once, then start or restart
  `bun run dev:tunnel` beside the local API. The tunnel forwards only that exact webhook path on the Resend hostname
  to `http://localhost:3000`; its existing Apple callback rule stays in place.
  Store that endpoint's signing secret as `RESEND_INBOUND_WEBHOOK_SECRET` in the matching API configuration.
- Preserve the existing `RESEND_FROM_EMAIL` mailbox and sending domain. Personal sources replies use the display name
  **Carl** and Reply-To set to that same mailbox. Topic scan email replies use it too. No sent-message metadata or
  thread fingerprints are required.
- Confirm the Temporal worker polls `personal-sources` and `personal-sources-email`, and the sweep runs with the same DB,
  encryption, auth-secret, Resend, and feature-flag configuration. Inbound retrieval shares outbound Resend's Redis limiter.
- Record the provider's actual received-mail retention and deletion controls before updating the public policy.
  Resend stores received mail independently of CarlNotes, including while a webhook is down. CarlNotes does not
  download raw messages or attachments. Do not claim that deleting a Personal sources item removes Resend's stored message.

The provider documents [receiving setup](https://resend.com/blog/inbound-emails),
[raw-body signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests), and
[the receiving API and its authentication fields](https://resend.com/docs/api-reference/emails/retrieve-received-email).

Resend's [security page](https://resend.com/security), checked November 2, 2026, documents 30-day email/log retention
for Free, Pro, and Scale. The controlled account's Settings → Usage screen showed **Pro**. Its received-message list
and detail menus exposed **Share email**, with no message-deletion or custom-retention control. Those observations
support using the published Pro retention as the current expectation; they do not establish an account-specific
override or immediate provider deletion. Confirm any custom agreement and the provider's deletion procedure before
production rollout. CarlNotes keeps each filed item encrypted until its sender deletes it.

The current [Anthropic Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy),
reviewed November 2, 2026, restricts extracting conversation summaries and persistently using conversation content
to build user profiles. Deliberate summary sends and derived Topic context need an explicit directory eligibility
decision; user initiation and a narrow tool description do not establish compliance. Keep imports in CarlNotes' web
UI and do not submit or update a directory listing on the assumption that this feature is approved. Record the
reviewer's decision or revise the submitted tool surface before submission. This is a rollout decision, not a claim
that the transport, annotations, or privacy tests failed.

The privacy policy describes collection, use/storage, sharing, retention, contact, receiving, imports, model/provider
processing, revocation, deletion, and retained metadata. Review the twenty-two-tool inventory, OAuth flow, policy URL,
and documentation URL against the live submission form before submitting manually. Production flags remain off
until controlled forwarding and the operator checklist are complete.

## Controlled forwarding checks

Use the test accounts chosen by the operator. Keep their addresses in the private QA notes.

1. Confirm `RESEND_FROM_EMAIL` names the environment’s owned sending and receiving mailbox, with or without a display name. Receiving, Copy, reply copy, and Reply-To use that value. Configure the matching Resend receiving domain and webhook before changing a development mailbox. Enable both receiving flags in development and restart the API and Temporal worker with the current Doppler secrets. Use an account entitled to Plus or Premium email receiving and any Topic that account can edit.
2. Send a synthetic Gmail message to the mailbox on a development topic scan email. Repeat with a forwarded newsletter
   and a `topic:` hint in the subject or first line.
3. Verify the authenticated From matches a verified account and both receiver checks pass. A genuinely authenticated unknown or unverified address gets same-thread account guidance. Other mailboxes, failed authentication, automated messages, and linkless acknowledgments stay silent.
4. With a subject hint or after the sender chooses, check one private item per matching editable Topic, one daily charge, and a same-thread confirmation with a numbered list of Topic links. Check the display name Carl, From, and Reply-To against the environment’s `RESEND_FROM_EMAIL`. The recipient is the authenticated From.
5. With no `topic:` hint in the subject, confirm Carl requests Topic numbers, names, or both in the same thread, even for strong matches or a first-body-line hint. With no suggestions he asks for names. Confirm the original content is filed only after a clear selection, using its original delivery identity. Check that another Topic editor cannot read it.
6. Reply “thanks” to a topic scan email and a filing confirmation, leaving their quoted links in place. Verify no
   matching call, entry, allowance charge, or reply. Reply to each with a new safe public link and verify Topic choices
   before filing and one shared charge after selection. Verify only newly authored text/links are stored. Redeliver the
   same webhook and verify unchanged entry/quota counts and no duplicate reply. Delete the accepted item while a reply
   retry is pending and verify its private snapshot is removed and no content is restored.
7. Mix AI sends and emails up to the shared 200-per-day ceiling. Count a multi-Topic message once and imports zero times. Email at the ceiling says “The day's email limit is reached.” Plus and Premium include email. The AI Agent API key requires Premium.
8. Keep the owner's requested review Topics, entries, and Sources. Remove only disposable failure fixtures. Record provider IDs and sanitized authentication evidence, and name the unverified Outlook check.

## Development verification

On November 3, 2026, the restarted development stack accepted controlled Gmail forwards at `carl-dev@updates.carlnotes.com`. Receiver DKIM and DMARC passed. Filing created one sender-private item per matching Topic for one shared charge, and Carl replied with numbered Topic links using the same From/Reply-To mailbox. A replay created no duplicate.

Live rich replies exposed a plain-text alternative that lost quote markers. After the parser fix, new-link replies to
both a topic scan email and filing confirmation stored only authored content and the new link. Linkless replies quoting
public links produced no item, charge, or reply. Existing review data and the synthetic regression/repeat items remain
for manual inspection. The controlled fixtures do not verify Outlook, unknown-account guidance, Free-plan upgrade mail,
or production rollout.

## Analytics

PostHog reports Personal sources with ids, counts, and flags. No event holds a title, a summary, a link, an email
address, a Topic name, or an API key's label or secret.

| Question | Event |
| --- | --- |
| What arrived | `personal_source_entry_received`, by `origin`: `send`, `email`, or `import` |
| What was turned away | `personal_sources_send_rejected`, `personal_sources_email_unfiled`, and `personal_sources_quota_reached` |
| Who emails without an account | `personal_sources_email_unregistered`, a visitor event with no address |
| What a sender removed | `personal_source_entry_deleted` and `source_removed` |
| What a sender connected | `source_added` with `sourceType` `ai_agent`, `ai_agent_api_key_created`, and `ai_agent_api_key_revoked` |
| What a sender disconnected | `ai_agent_disconnected` |
| Whether the link nudge helps | `personal_sources_nudge_dismissed` |
| Whether sends find a Topic | `topics_suggested` with `suggestedCount` |
| Whether summaries build | `personal_sources_context_built` with `entryCount` |
| Whether Scans use the material | `scan_completed` with `personalFindingsKept` and `privateAnnotationsSaved` |

Events from an API key send have `entryPoint` `api`. Events from the worker have `entryPoint` `worker`.

An MCP view can reach the server only through a tool call or its audio request. A Finding opened in an MCP view and a
podcast episode finished there report nothing.

## Rollback

Disable receiving flags to pause new filings. Keep sender-only reads, deletion, revocation, and delivery retries available. Preserve the encryption key, accepted items and the old development review copies. Confirm public Finding explanations and podcast audio contain page-only text before restoring receiving.

The schema migration preserves sender identity and moves legacy private-derived Finding/report text into encrypted sender history before normal sharing is unlocked. The renamed legacy context table retained its original primary-key constraint name; the approved unapplied migration explicitly replaces that key with (Topic, sender). Never rewrite a published migration. The unpublished feature migration was regenerated without obsolete reply-fingerprint metadata; the development-only reconciliation verified all 45 retained review items unchanged.
