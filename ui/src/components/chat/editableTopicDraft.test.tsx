// the mapping from a topic to a topic draft: sources by option key, the team, and the email invites
import { expect, test } from "bun:test"
import { EMPTY_TOPIC_DRAFT, type TopicDraft } from "@shared/contracts"
import { renderToStaticMarkup } from "react-dom/server"
import { toEditableTopicDraft } from "./editableTopicDraft"
import { TopicDraftCard } from "./TopicDraftCard"

test("a topic maps to a topic draft, dropping an invite with no email and a source of a kind no option offers", () => {
	const editableTopicDraft = toEditableTopicDraft({
		name: "Where to hoop",
		prompt: "Pickup basketball near San Mateo",
		visibility: "invite",
		team: { teamId: "team-1", name: "Kickin it", isPublic: false },
		tags: ["sports"],
		frequency: "weekly",
		scheduledTime: "09:00",
		scheduledDayOfWeek: "wednesday",
		maxTopicFindings: 10,
		sources: [
			{ id: "source-1", sourceKind: "search", summary: "" },
			{ id: "source-2", sourceKind: "reddit", summary: "r/basketball" },
			{ id: "source-3", sourceKind: "composio", summary: "gmail" },
		],
		invites: [{ email: "friend@example.com" }, { email: null }],
	})
	expect(editableTopicDraft).toEqual({
		name: "Where to hoop",
		prompt: "Pickup basketball near San Mateo",
		sources: [
			{ sourceOption: "webSearch", value: "" },
			{ sourceOption: "reddit", value: "r/basketball" },
		],
		inviteEmails: ["friend@example.com"],
		visibility: "invite",
		team: { teamId: "team-1", name: "Kickin it" },
		tags: ["sports"],
		frequency: "weekly",
		scheduledTime: "09:00",
		scheduledDayOfWeek: "wednesday",
		maxTopicFindings: 10,
	})
})

// a proposal's fields update, its added sources join, and its removed ones go
test("toEditableTopicDraft previews a proposal over the topic", () => {
	const topic = {
		name: "Where to hoop",
		prompt: "Pickup basketball near San Mateo",
		visibility: "public" as const,
		team: null,
		tags: ["sports"],
		frequency: "weekly" as const,
		scheduledTime: "09:00",
		scheduledDayOfWeek: "wednesday" as const,
		maxTopicFindings: 10,
		sources: [
			{ id: "source-1", sourceKind: "reddit" as const, summary: "r/basketball" },
			{ id: "source-2", sourceKind: "rss" as const, summary: "hoopsrumors.com" },
		],
		invites: [],
	}
	const previewedTopicDraft = toEditableTopicDraft(topic, {
		prompt: "Pickup basketball and open gyms near San Mateo",
		frequency: "daily",
		addSources: [{ sourceOption: "youtube" as const, value: "Hoops Tonight" }],
		removeSourceIds: ["source-2"],
	})
	expect(previewedTopicDraft.prompt).toBe("Pickup basketball and open gyms near San Mateo")
	expect(previewedTopicDraft.frequency).toBe("daily")
	expect(previewedTopicDraft.sources).toEqual([
		{ sourceOption: "reddit", value: "r/basketball" },
		{ sourceOption: "youtube", value: "Hoops Tonight" },
	])
	// a field the proposal leaves alone still reads as the topic has it saved
	expect(previewedTopicDraft.tags).toEqual(["sports"])
})

// a create leaves the team on the empty topic draft for the next topic, and the card must not linger on that alone
test("a topic draft holding only a team is empty", () => {
	const teamOnlyDraft: TopicDraft = { ...EMPTY_TOPIC_DRAFT, team: { teamId: "team-1", name: "Notes of Carl" } }
	expect(renderToStaticMarkup(<TopicDraftCard topicDraft={teamOnlyDraft} />)).toBe("")
	// anything the user actually dictated brings it back
	expect(renderToStaticMarkup(<TopicDraftCard topicDraft={{ ...teamOnlyDraft, name: "Hoops" }} />)).toContain("Hoops")
})
