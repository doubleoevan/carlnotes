## Context

The topic card and its proposal tools were built across several sessions and shipped ahead of their specs. This change
includes no code: it corrects three statements the specs make that the code contradicts, and writes down the preview card
for the first time. The design notes below record why the shipped shape is the one being specified, instead of changing
the code to match the old words.

## Decisions

### Carl proposes with a tool, not in prose

The old requirement said Carl proposes an edit in prose. Prose cannot be verified. A reply claiming a save it never made
reads exactly like one that did, and that is the failure this codebase kept hitting. `proposeTopicEdit` saves nothing,
takes the same payload a save would, and renders the result on the card — so the reader sees the change itself rather
than Carl's description of it, and the card is the record instead of the sentence.

### The proposal tools are bound outside the tools a consent may force

A consent ("yes", "do it") restricts the reply's first step to the tools that save, so a yes cannot be answered by a
tool that writes nothing. `proposeTopicEdit` and `cancelTopicEdit` therefore sit outside that set. They are also gated
on a proposal actually standing, so a yes answering an ordinary question forces no save at all.

### The card shows the loading instead of filling in mid-stream

The old requirement had fields appearing before the reply finished. In practice a turn writes the draft once, partway
through a reply that keeps going for seconds, so the card changed at a moment unrelated to anything the reader was
reading. Showing the app's loading while Carl owes a reply, then revealing the fields, makes the card's change a single
legible event. The per-field fade then says which line moved.

### A created topic ends the conversation

The draft is one row per user with no conversation boundary, so a conversation that made a topic keeps feeding that
topic back to Carl on every later turn, and stale fields ride along into the next topic. Clearing on create is the only
boundary the data model offers. The clear runs after the turn is saved, since the save writes the created turn back.

## Risks / Trade-offs

- Clearing on create loses the conversation that made the topic. The reply announcing the create stays on screen, so the
  reader keeps the confirmation, but the history is gone on the next load. Accepted: a conversation about a topic that
  now exists belongs to that topic's own chat, not to the new-topic chat.
- Titling the saved state "Topic draft" reads as unsaved to some readers. Chosen deliberately: the reader is mid-edit,
  and "Topic preview" is reserved for the state that genuinely is not saved.

## Migration Plan

No requirement here needs migrating. The specs move to where the code already is.

The code they describe ships in the same change list and does carry two additive migrations, which run on deploy:
`topic_drafts` for the stored draft, and `chat_turns.tool_calls` for the calls a turn replays. Rows written before
either existed still read: `loadTopicDraft` reads a draft whose shape no longer parses as none, and a chat turn whose
`tool_calls` is null or will not decrypt reads as no tool calls.

The reply stream's line format changes with the same deploy, and that one is not backward compatible. A browser tab
left open across the deploy holds the old api client, which streamed every byte that was not the failure marker
straight to the bubble, so it would show the new JSON lines as literal text. Reloading the page fixes it, nothing is
saved wrong, and no already-stored chat turn is affected, since the line format exists only in the stream and never in
what is stored.

## Open Questions

None.
