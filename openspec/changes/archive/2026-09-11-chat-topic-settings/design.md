## Context

The draft already carries every field the create needs but tags, frequency, and maxTopicFindings, and `createTopic` takes all of them. On the edit side the prompt tool shows the shape: the gate loads the editable topic, the write happens, and the result names the topic.

## Goals / Non-Goals

- Goals: the three settings in both chats, optional, with the editor's defaults; a daily move checked against the plan the way the editor checks it; the MCP server offering the same tool.
- Non-Goals: the schedule's time and day of week, which keep the editor's defaults; title, visibility, invites, and team on the edit side; a fourth-field-at-a-time confirmation, since one yes covers the named fields together.

## Decisions

- `updateTopicFields` takes optional fields and writes only the ones named, on the topics row, since the scan schedule reads the row and needs no separate sync.
- The draft carries `tags`, `frequency`, and `maxTopicFindings` with the defaults no tags, weekly, and ten, so a create without them matches the editor's. `updateTopicFields` takes any non-empty subset of the three and leaves the fields it does not name as they were.
- `maxTopicFindings` reuses the editor's fixed options, so the model cannot pick a size the plan does not offer.
- Tags on the draft are bounded, ten of forty characters, since the model writes them.
- The wizard offers the settings in one breath rather than three questions, and skips them when the reader says nothing.

## Risks / Trade-offs

- A daily frequency the plan cannot hold is rejected at the save with the editor's reason, so a reader who asked for daily hears it then, not at the draft.
