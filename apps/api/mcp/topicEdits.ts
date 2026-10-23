// the mcp edit_topic tool's flow: read the topic as its page does, preview an edit that needs the user's agreement,
// and save every other edit, or a confirmed one, through the chat's own save path
import { type EditableTopicFields, toEditableTopicDraft } from "@carlnotes/contracts/topicEdits"
import type { ProposeTopicEditPayload, TopicDraft } from "@carlnotes/contracts/topicPayloads"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { AnalyticsProperties } from "../currentUser"
import { toEmptyChatTurnToolCalls } from "../tool/chatTools"
import { applyTopicEdit } from "../tool/topicEditSaves"
import { loadTopicPage } from "../topic/topics"
import {
	isTopicEditConfirmed,
	type TopicEditConfirmationReason,
	toTopicEditConfirmation,
	toTopicEditConfirmationReasons,
} from "./topicEditConfirmations"

// the topic an edit_topic result shows: its id and name, its sources with their ids, and its fields before and after
type EditTopicResultTopic = {
	topicId: string
	name: string
	topicSources: { id: string; sourceKind: string; summary: string }[]
	beforeTopicDraft: TopicDraft
	afterTopicDraft: TopicDraft
}

// a saved edit: each save's line for the toast, each rejection, and what each save returned
type SavedEditTopicResult = EditTopicResultTopic & {
	status: "saved"
	savedLines: string[]
	rejectedLines: string[]
	serverToolCallOutputs: string[]
}

// a previewed edit: what needs the user's agreement, the sources it would remove, and the confirmation that saves it
type PreviewedEditTopicResult = EditTopicResultTopic & {
	status: "confirmRequired"
	topicEditConfirmationReasons: TopicEditConfirmationReason[]
	removeSourceIds: string[]
	confirmation: string
}

// what an edit did: saved, previewed, or rejected before anything was read
export type EditTopicResult =
	| SavedEditTopicResult
	| PreviewedEditTopicResult
	| { status: "missing" }
	| { status: "forbidden" }

// who saves, the topic and its edit, the confirmation a previous call returned, and the request's analytics properties
export type EditTopicOptions = {
	userId: string
	topicId: string
	topicEdit: ProposeTopicEditPayload
	confirmation: string | null
	analyticsProperties: AnalyticsProperties
}

/**
 * Saves a topic edit through the chat's save path. An edit that makes the topic public or removes a source saves only
 * with a confirmation issued for that edit over the topic as it stands, and otherwise returns its preview.
 */
export async function editTopic({
	userId,
	topicId,
	topicEdit,
	confirmation,
	analyticsProperties,
}: EditTopicOptions): Promise<EditTopicResult> {
	// read the topic as its page does, and stop for a user who may not edit it before any field is returned
	const topicPage = await loadTopicPage(userId, topicId)
	if (!topicPage) {
		return { status: "missing" }
	}
	if (!topicPage.canEdit) {
		return { status: "forbidden" }
	}

	// an edit that needs the user's agreement returns its preview until a confirmation for it comes back
	const editableTopicFields = toEditableTopicFields(topicPage)
	const topicEditConfirmationOptions = { userId, topicId, topicEdit, editableTopicFields }
	const topicEditConfirmationReasons = toTopicEditConfirmationReasons(editableTopicFields, topicEdit)
	const isConfirmed = confirmation !== null && isTopicEditConfirmed(topicEditConfirmationOptions, confirmation)
	if (topicEditConfirmationReasons.length > 0 && !isConfirmed) {
		return {
			status: "confirmRequired",
			...toEditTopicResultTopic(topicPage, toEditableTopicDraft(editableTopicFields, topicEdit)),
			topicEditConfirmationReasons,
			removeSourceIds: topicEdit.removeSourceIds ?? [],
			confirmation: toTopicEditConfirmation(topicEditConfirmationOptions),
		}
	}

	// save through the chat's path, which lists each save and each rejection, then read the topic as it now stands
	const toolCalls = toEmptyChatTurnToolCalls()
	const serverToolCalls = await applyTopicEdit(
		{ userId, topicId, origin: "mcp", toolCalls, analyticsProperties },
		topicEdit,
	)
	const savedTopicPage = await loadTopicPage(userId, topicId)
	const afterTopicDraft = toEditableTopicDraft(
		savedTopicPage ? toEditableTopicFields(savedTopicPage) : editableTopicFields,
	)
	return {
		status: "saved",
		...toEditTopicResultTopic(topicPage, afterTopicDraft),
		savedLines: toolCalls.topicSaves,
		rejectedLines: toolCalls.topicSaveRejections,
		serverToolCallOutputs: serverToolCalls.map((serverToolCall) => String(serverToolCall.output)),
	}
}

/**
 * Returns a topic page's fields in the shape the topic card previews an edit over.
 */
export function toEditableTopicFields(topicPage: TopicResponse): EditableTopicFields {
	return {
		name: topicPage.name,
		prompt: topicPage.prompt,
		visibility: topicPage.visibility,
		team: topicPage.team,
		tags: topicPage.tags,
		frequency: topicPage.frequency,
		scheduledTime: topicPage.scheduledTime,
		scheduledDayOfWeek: topicPage.scheduledDayOfWeek,
		maxTopicFindings: topicPage.maxTopicFindings,
		podcast: topicPage.podcast,
		sources: topicPage.sources.map(({ id, sourceKind, summary }) => ({ id, sourceKind, summary })),
		invites: topicPage.invites.map(({ email }) => ({ email })),
	}
}

// the topic's id, name, and sources from its page as it stood, its fields before, and the fields after
function toEditTopicResultTopic(topicPage: TopicResponse, afterTopicDraft: TopicDraft): EditTopicResultTopic {
	const editableTopicFields = toEditableTopicFields(topicPage)
	return {
		topicId: topicPage.id,
		name: topicPage.name,
		topicSources: editableTopicFields.sources,
		beforeTopicDraft: toEditableTopicDraft(editableTopicFields),
		afterTopicDraft,
	}
}
