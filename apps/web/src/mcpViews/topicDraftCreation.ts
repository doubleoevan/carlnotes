// edited creation confirms only the exact fields the person reviewed
import type { McpViewTopicResult } from "@carlnotes/contracts/mcpViews"
import { createTopicPayload, type TopicDraft } from "@carlnotes/contracts/topicPayloads"
import { MAX_TOPIC_SOURCES } from "@carlnotes/contracts/topics"
import { callMcpViewTool } from "./mcpViewHost"
import { countMcpTopicDraftSources } from "./topicDraftSources"

type CreatePreview = Extract<McpViewTopicResult, { status: "createConfirmRequired" }>
type CreatedTopic = Extract<McpViewTopicResult, { status: "created" | "saved" }>
type DraftCreationResult =
	| { status: "created"; topic: CreatedTopic; name: string }
	| { status: "preview"; preview: CreatePreview; rejection: string }
	| { status: "failed"; rejection: string }

/**
 * Refreshes changed signed fields and creates only the exact confirmed Topic Draft.
 */
export async function createEditedTopicDraft({
	preview,
	draft,
}: {
	preview: CreatePreview
	draft: TopicDraft | null
}): Promise<DraftCreationResult> {
	// reject incomplete or over-capacity drafts before host calls
	const parsed = createTopicPayload.safeParse(draft)
	if (!parsed.success || countMcpTopicDraftSources(parsed.data.sources) > MAX_TOPIC_SOURCES) {
		return { status: "failed", rejection: "Check the title, prompt, Sources, and Topic settings before creating." }
	}
	const topicDraft = parsed.data
	let confirmation = preview.confirmation
	if (JSON.stringify(topicDraft) !== JSON.stringify(createTopicPayload.parse(preview.afterTopicDraft))) {
		const refreshed = await prepareEditedTopicDraft(topicDraft)
		if (refreshed.status !== "ready") {
			return refreshed
		}
		confirmation = refreshed.preview.confirmation
	}

	// the explicit Create click confirms these exact visible fields
	const result = await callMcpViewTool("create_topic", { ...topicDraft, confirmation })
	const topic = result.structuredContent as McpViewTopicResult | undefined
	if (!result.isError && topic?.status === "created") {
		return { status: "created", topic, name: topicDraft.name }
	}
	if (topic?.status === "createConfirmRequired") {
		return { status: "preview", preview: topic, rejection: "Review the refreshed draft and press Create again." }
	}
	return { status: "failed", rejection: toCreationRejection(result.content) }
}

// require another click if the server proposes different normalized fields
async function prepareEditedTopicDraft(
	topicDraft: TopicDraft,
): Promise<{ status: "ready"; preview: CreatePreview } | Exclude<DraftCreationResult, { status: "created" }>> {
	const result = await callMcpViewTool("create_topic", topicDraft)
	const preview = result.structuredContent as McpViewTopicResult | undefined
	if (result.isError || preview?.status !== "createConfirmRequired") {
		return { status: "failed", rejection: toCreationRejection(result.content) }
	}
	if (JSON.stringify(createTopicPayload.parse(preview.afterTopicDraft)) !== JSON.stringify(topicDraft)) {
		return { status: "preview", preview, rejection: "The preview changed. Review the fields and press Create again." }
	}
	return { status: "ready", preview }
}

// keep an expected tool rejection while network failures remain handled by the MCP view
function toCreationRejection(content: unknown): string {
	if (!Array.isArray(content)) {
		return "The draft could not be saved. Your edits are retained."
	}
	return (
		content.map((block) => (typeof block.text === "string" ? block.text : "")).join(" ") ||
		"The draft could not be saved. Your edits are retained."
	)
}
