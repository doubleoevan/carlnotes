## Context

The new-topic chat lists the teams the user leads in its prompt, and step 5 told Carl to ask whether the topic should
go on one, with skipping allowed. The draft's visibility defaults to invite. The create tool, `createTopic`, saves the
draft through `createTopicFromDraft` and adds it to the named team through the leader-only path. Nothing required a
team, so a model that skipped step 5 saved a shared topic on no team.

## Goals / Non-Goals

**Goals:**

- A public or invite topic made in chat names a team the user leads.
- A user with no team still gets a topic, made private.

**Non-Goals:**

- The MCP `create_topic` tool, which has its own arguments and no conversation to ask in.
- Creating a team from the chat.

## Decisions

**The prompt asks, and the create tool checks.** The prompt makes the question part of step 5 for any public or invite
draft. The create tool returns `TEAM_MISSING_TEXT` for a public or invite draft with no team and saves nothing, so a
skipped question becomes one more turn instead of a topic on no team. The check sits in the chat tool, not in
`createTopicFromDraft`, so the form and the MCP path keep their own rules.

**No team means private.** A user who leads no team can't put a shared topic on one, so Carl makes it private and
says so. The same goes for a user who says no team.

## Risks / Trade-offs

- [One more question in the conversation] → only for a shared topic whose draft names no team.
- [A user with no team can't make a public topic in chat] → they can create a team and change the visibility on the
  topic page afterward.

## Migration Plan

No schema change. The prompt syncs to Langfuse after deploy.
