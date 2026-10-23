// a topic edit's saves: the prompt, the settings, and each source removed or added, each through its Topic Tool, which
// checks edit rights itself
import type { ChatToolCall } from "@carlnotes/contracts/payloads"
import { KEEP_ONE_SOURCE_MESSAGE } from "@carlnotes/contracts/sources"
import type { AddTopicSourcePayload, ProposeTopicEditPayload } from "@carlnotes/contracts/topicPayloads"
import type { AnalyticsProperties } from "../currentUser"
import type { PromptVersionOrigin } from "../topic/promptVersions"
import {
	type ChatTurnToolCalls,
	CREATE_REJECTION_LINES,
	toAddTopicSourceText,
	toGateReason,
	toRejectionText,
	toRejectionToast,
	toRemoveTopicSourceText,
	toSavedTopicFieldsText,
	toSavedTopicPromptText,
	toUpdateTopicFieldsText,
} from "./chatTools"
import {
	type AddTopicSourceResult,
	addTopicSource,
	type RemoveTopicSourceResult,
	removeTopicSource,
} from "./topicSourceTools"
import { type UpdateTopicFieldsResult, updateTopicFields, updateTopicPrompt } from "./topicTools"

// the user and topic a save acts on, the adapter it saves from, the turn's tool calls the save is listed in, and the
// request's analytics properties
type TopicEditSaveBinding = {
	userId: string
	topicId: string
	origin: PromptVersionOrigin
	toolCalls: ChatTurnToolCalls
	analyticsProperties?: AnalyticsProperties
}

/**
 * Applies a topic edit's saves in order and returns each as a call of its tool.
 */
export async function applyTopicEdit(
	topicEditSaveBinding: TopicEditSaveBinding,
	topicEdit: ProposeTopicEditPayload,
): Promise<ChatToolCall[]> {
	const serverToolCalls: ChatToolCall[] = []
	for (const topicEditSave of toTopicEditSaves(topicEdit)) {
		const output = await applyTopicEditSave(topicEditSaveBinding, topicEditSave)
		serverToolCalls.push({ ...topicEditSave, output })
	}
	return serverToolCalls
}

// one save an agreed topic edit makes: the save tool it goes through, and that tool's input
type TopicEditSave =
	| { toolName: "updateTopicPrompt"; input: { prompt: string } }
	| { toolName: "updateTopicFields"; input: Record<string, unknown> }
	| { toolName: "removeSource"; input: { sourceId: string } }
	| { toolName: "addSource"; input: AddTopicSourcePayload }

/**
 * Returns the saves an agreed topic edit makes, in order: the prompt, then the settings fields in one save, then each
 * removed source, then each added source.
 */
export function toTopicEditSaves(topicEdit: ProposeTopicEditPayload): TopicEditSave[] {
	// the settings fields the edit names, apart from the prompt and the sources
	const { prompt, addSources = [], removeSourceIds = [], ...topicFields } = topicEdit
	const namedTopicFields = Object.fromEntries(Object.entries(topicFields).filter(([, value]) => value !== undefined))
	const promptSaves: TopicEditSave[] =
		prompt === undefined ? [] : [{ toolName: "updateTopicPrompt", input: { prompt } }]
	const topicFieldsSaves: TopicEditSave[] =
		Object.keys(namedTopicFields).length === 0 ? [] : [{ toolName: "updateTopicFields", input: namedTopicFields }]

	// the edit's saves in the order they apply
	return [
		...promptSaves,
		...topicFieldsSaves,
		...removeSourceIds.map((sourceId): TopicEditSave => ({ toolName: "removeSource", input: { sourceId } })),
		...addSources.map((topicSource): TopicEditSave => ({ toolName: "addSource", input: topicSource })),
	]
}

// apply one save through the path its save tool takes, and return the save's result text
function applyTopicEditSave(topicEditSaveBinding: TopicEditSaveBinding, topicEditSave: TopicEditSave): Promise<string> {
	switch (topicEditSave.toolName) {
		// the prompt and the settings fields
		case "updateTopicPrompt":
			return saveTopicPromptEdit(topicEditSaveBinding, topicEditSave.input.prompt)
		case "updateTopicFields":
			return saveTopicFieldsEdit(topicEditSaveBinding, topicEditSave.input)
		// one source removed or added
		case "removeSource":
			return saveRemovedTopicSource(topicEditSaveBinding, topicEditSave.input.sourceId)
		case "addSource":
			return saveAddedTopicSource(topicEditSaveBinding, topicEditSave.input)
	}
}

/**
 * Rewrites the topic prompt for a topic edit, listing the save or its rejection for the toast. Returns the save's
 * result text.
 */
async function saveTopicPromptEdit(
	{ userId, topicId, origin, toolCalls, analyticsProperties }: TopicEditSaveBinding,
	prompt: string,
): Promise<string> {
	// count the call before the write. a failed write still counts
	toolCalls.count += 1
	const updateTopicPromptResult = await updateTopicPrompt({
		userId,
		topicId,
		prompt,
		origin,
		analyticsProperties,
	})
	if (updateTopicPromptResult.status !== "saved") {
		toolCalls.topicSaveRejections.push(
			toRejectionToast("save the prompt", toGateReason(updateTopicPromptResult.status)),
		)
		return toRejectionText(updateTopicPromptResult.status)
	}
	// list the save for the toast
	toolCalls.topicSaves.push("Carl saved the new prompt.")
	return toSavedTopicPromptText(updateTopicPromptResult.topicName)
}

/**
 * Changes the topic's fields for a topic edit, listing the save or its rejection for the toast. Returns the save's
 * result text.
 */
async function saveTopicFieldsEdit(
	{ userId, topicId, origin, toolCalls, analyticsProperties }: TopicEditSaveBinding,
	topicFields: Parameters<typeof updateTopicFields>[0]["topicFields"],
): Promise<string> {
	// count the call before the write. a failed write still counts
	toolCalls.count += 1
	const updateTopicFieldsResult = await updateTopicFields({
		userId,
		topicId,
		topicFields,
		promptVersionOrigin: origin,
		analyticsProperties,
	})
	if (updateTopicFieldsResult.status !== "saved") {
		toolCalls.topicSaveRejections.push(
			toRejectionToast("save the settings", toUpdateTopicFieldsReason(updateTopicFieldsResult)),
		)
		return toUpdateTopicFieldsText(updateTopicFieldsResult)
	}
	// list the save for the toast
	toolCalls.topicSaves.push("Carl saved the topic's settings.")
	return toSavedTopicFieldsText(updateTopicFieldsResult.topicName)
}

/**
 * Adds a source for a topic edit, listing the save or what stopped it for the toast. Returns the save's result text.
 */
async function saveAddedTopicSource(
	{ userId, topicId, origin, toolCalls, analyticsProperties }: TopicEditSaveBinding,
	{ sourceOption, value }: AddTopicSourcePayload,
): Promise<string> {
	// count the call before the write. a failed write still counts
	toolCalls.count += 1
	const addTopicSourceResult = await addTopicSource({
		userId,
		topicId,
		sourceOption,
		value,
		origin,
		analyticsProperties,
	})
	// list the save, or what stopped it, for the toast
	if (addTopicSourceResult.status === "saved") {
		toolCalls.topicSaves.push(`Carl added ${addTopicSourceResult.topicSourceLabel}.`)
	} else {
		toolCalls.topicSaveRejections.push(toAddTopicSourceToast(addTopicSourceResult))
	}
	return toAddTopicSourceText(addTopicSourceResult)
}

/**
 * Removes a source for a topic edit, listing the save or its rejection for the toast. Returns the save's result
 * text.
 */
async function saveRemovedTopicSource(
	{ userId, topicId, origin, toolCalls, analyticsProperties }: TopicEditSaveBinding,
	sourceId: string,
): Promise<string> {
	// count the call before the write. a failed write still counts
	toolCalls.count += 1
	const removeTopicSourceResult = await removeTopicSource({
		userId,
		topicId,
		sourceId,
		origin,
		analyticsProperties,
	})

	// list the rejection, or the removal unless the row was already gone, for the toast
	if (removeTopicSourceResult.status !== "saved") {
		toolCalls.topicSaveRejections.push(toRemoveTopicSourceToast(removeTopicSourceResult.status))
	} else if (removeTopicSourceResult.topicSourceLabel) {
		toolCalls.topicSaves.push(`Carl removed ${removeTopicSourceResult.topicSourceLabel}.`)
	}
	return toRemoveTopicSourceText(removeTopicSourceResult)
}

// the toast's reason for a rejected settings save
function toUpdateTopicFieldsReason(
	updateTopicFieldsResult: Exclude<UpdateTopicFieldsResult, { status: "saved" }>,
): string {
	if (updateTopicFieldsResult.status === "empty") {
		return "No setting was named."
	}

	// give the reason for the plan's daily limit or the gate's rejection
	return updateTopicFieldsResult.status === "dailyFrequency"
		? CREATE_REJECTION_LINES.dailyFrequency
		: toGateReason(updateTopicFieldsResult.status)
}

// the toast for a removal that did not save: web search, the last source, or what stopped the removal
function toRemoveTopicSourceToast(status: Exclude<RemoveTopicSourceResult["status"], "saved">): string {
	if (status === "webSearch") {
		return "Carl couldn't remove web search."
	}
	return toRejectionToast(
		"remove that source",
		status === "lastSource" ? KEEP_ONE_SOURCE_MESSAGE : toGateReason(status),
	)
}

// the toast for an add that did not save: a source the topic already reads, or what stopped the add
function toAddTopicSourceToast(addTopicSourceResult: Exclude<AddTopicSourceResult, { status: "saved" }>): string {
	// word each rejection, a source already read in its own line
	switch (addTopicSourceResult.status) {
		case "present":
			return `Carl didn't add ${addTopicSourceResult.topicSourceLabel}. This topic already has it.`
		// a bad value or a full topic
		case "invalid":
			return toRejectionToast("add that source", "It needs a url, handle, or id.")
		case "limit":
			return toRejectionToast(
				"add that source",
				`This topic holds ${addTopicSourceResult.limit} sources, the most a topic can.`,
			)
		default:
			return toRejectionToast("add that source", toGateReason(addTopicSourceResult.status))
	}
}
