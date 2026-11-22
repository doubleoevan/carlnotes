# Proposal

## Why

Anthropic's Connectors Directory review reads each tool's annotations for a human-readable name, and 45 of 45
CarlNotes tools carry their title only at the top level. `set_topic_image` also renders a new image from a free-text
image prompt, a paid model call that an AI host can start with no page in front of the person. The review is a good
moment to keep that render on the topic page, where the person sees the month's regenerations and the result.

## What Changes

- **Annotation titles.** Every tool's `annotations.title` is its existing title. The directory contract check fails
  if a tool's annotations lack the title, name it differently, or set neither `readOnlyHint` nor `destructiveHint`.
- **set_topic_image takes a url only.** The `image_prompt` parameter is gone. A call with an `image_url` replaces the
  image as before. A call without one starts no render and returns an error that names the topic page, where
  Regenerate stays as it is.
- **The registry version.** `server.json` moves to 1.0.1.

## Capabilities

### Modified Capabilities

- `mcp-server`: the annotation contract requires `annotations.title`, `set_topic_image` sets an image from a url
  alone, and the tool count reads forty-five.

## Impact

- `apps/api/mcp/`: every tool registration, `topicImageTool.ts`, the contract fixture, and the smoke sections.
- `apps/docs/src/content/docs/account/add-to-ai.md`: the `set_topic_image` row.
- `server.json`: the version.
- The site's topic image regenerate and its routes are unchanged.
