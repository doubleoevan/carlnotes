// the topic draft card's empty state
import { expect, test } from "bun:test"
import { EMPTY_TOPIC_DRAFT, type TopicDraft } from "@carlnotes/contracts/topicPayloads"
import { renderToStaticMarkup } from "react-dom/server"
import { TopicDraftCard } from "./TopicDraftCard"

// a create leaves the team on the empty topic draft for the next topic, and the card must not linger on that alone
test("a topic draft holding only a team is empty", () => {
	const teamOnlyDraft: TopicDraft = { ...EMPTY_TOPIC_DRAFT, team: { teamId: "team-1", name: "Notes of Carl" } }
	expect(renderToStaticMarkup(<TopicDraftCard topicDraft={teamOnlyDraft} />)).toBe("")
	// anything the user actually dictated brings it back
	expect(renderToStaticMarkup(<TopicDraftCard topicDraft={{ ...teamOnlyDraft, name: "Hoops" }} />)).toContain("Hoops")
})
