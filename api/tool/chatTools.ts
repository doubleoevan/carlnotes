// the chat adapters for a topic: the edit tools bound to one chat turn's topic, and the wording every adapter shares
import type { TopicToolCalls } from "@shared/contracts"
import {
	addTopicSourcePayload,
	proposeTopicEditPayload,
	removeTopicSourcePayload,
	updateTopicPromptPayload,
} from "@shared/topicPayloads"
import { type Tool, tool } from "ai"
import { z } from "zod"
import type { AnalyticsProperties } from "../currentUser"
import type { CreateTopicFromDraftResult } from "./topicDraftTools"
import { type AddTopicSourceResult, addTopicSource, removeTopicSource } from "./topicSourceTools"
import {
	toPodcastFieldDescription,
	toUpdateTopicFieldsShape,
	type UpdateTopicFieldsResult,
	updateTopicFields,
	updateTopicPrompt,
} from "./topicTools"

// what the topic tools did in one chat turn: what the api client is told, plus how many tools were called
export type ChatTurnToolCalls = TopicToolCalls & { count: number }

// the confirmation rule every tool description ends with
export const CONFIRMATION_RULE =
	"Call this only in a turn after the reader said yes to the exact change you proposed in an earlier turn."

// what one chat turn's tools are bound to, and the request's analytics properties if a request is behind the turn
type EditTopicToolBinding = {
	userId: string
	topicId: string
	toolCalls: ChatTurnToolCalls
	analyticsProperties?: AnalyticsProperties
}

/**
 * Binds the topic tools to one chat session's topic, so no message can point a tool at another topic, each tool
 * checking edit rights itself and listing what it saved.
 */
export function toChatTopicTools(editTopicToolBinding: EditTopicToolBinding): Record<string, Tool> {
	return {
		updateTopicPrompt: toUpdateTopicPromptTool(editTopicToolBinding),
		addSource: toAddTopicSourceTool(editTopicToolBinding),
		removeSource: toRemoveTopicSourceTool(editTopicToolBinding),
		updateTopicFields: toUpdateTopicFieldsTool(editTopicToolBinding),
	}
}

/**
 * Builds the tool that opens the new-topic chat, where Carl makes a topic.
 */
export function toOpenNewTopicChatTool({ toolCalls }: { toolCalls: ChatTurnToolCalls }): Tool {
	return tool({
		description:
			"Open the new-topic chat for the reader, where a topic is built and created. Call this when the reader asks for a new topic. Nothing about a new topic can be made in this chat.",
		inputSchema: z.object({}),
		execute: async () => {
			// leave this call out of the count that keeps a chat turn's text
			toolCalls.isNewTopicChatOpened = true
			return "The new-topic chat is opening beside this one. Tell the reader to continue there, in one line."
		},
	})
}

/**
 * The pair that drives the topic's card in a chat that may edit it. One puts a proposed change on the card and the
 * other takes it back off. Neither saves, so neither is bound with the saving tools, the only ones toConsentStep
 * may force.
 */
export function toTopicEditPreviewTools({ toolCalls }: { toolCalls: ChatTurnToolCalls }): {
	proposeTopicEditTool: Tool
	cancelTopicEditTool: Tool
} {
	return {
		proposeTopicEditTool: toProposeTopicEditTool({ toolCalls }),
		cancelTopicEditTool: toCancelTopicEditTool({ toolCalls }),
	}
}

/**
 * Builds the tool that previews a change to this topic. It saves nothing and only shows the user the topic as it
 * would read with the change applied, so the user can refine it before saying yes.
 */
export function toProposeTopicEditTool({ toolCalls }: { toolCalls: ChatTurnToolCalls }): Tool {
	return tool({
		description:
			"Preview a change to this topic for the reader: show the topic as it would read with your change applied. Call this in the same turn you propose a change, before you describe it, and again every time you revise the proposal. Name every field you would change. For sources, name what you would add in addSources and the ids you would drop in removeSourceIds, so a source you leave unnamed stays. Tags are sent whole. This saves nothing and changes nothing. Do not call it when the reader is only asking about findings.",
		inputSchema: proposeTopicEditPayload,
		execute: async (proposedTopicEdit) => {
			// leave this call out of the count that keeps a chat turn's text
			toolCalls.proposedTopicEdit = proposedTopicEdit
			return "The reader can see the topic as it would read with this change. Describe it in words and wait for a yes."
		},
	})
}

/**
 * Builds the tool that cancels a proposed change. It saves nothing and only takes the preview off the card,
 * for a user who turned the change down.
 */
export function toCancelTopicEditTool({ toolCalls }: { toolCalls: ChatTurnToolCalls }): Tool {
	return tool({
		description:
			"Cancel the change you proposed, taking it off the reader's topic card. Call this when the reader turns a proposal down or drops the subject, so the card stops previewing a change nobody is making. This saves nothing and changes nothing.",
		inputSchema: z.object({}),
		execute: async () => {
			// leave this call out of the count that keeps a chat turn's text
			toolCalls.isTopicEditCancelled = true
			return "The preview is off the card. The topic reads as it is saved."
		},
	})
}

// the tool that rewrites the topic prompt
function toUpdateTopicPromptTool({ userId, topicId, toolCalls, analyticsProperties }: EditTopicToolBinding): Tool {
	return tool({
		description: `Rewrite what the reader is looking for, the prompt every brew scores against. ${CONFIRMATION_RULE}`,
		inputSchema: updateTopicPromptPayload,
		execute: async ({ prompt }) => {
			// count the call before the write. a failed write still counts
			toolCalls.count += 1
			const updateTopicPromptResult = await updateTopicPrompt({
				userId,
				topicId,
				prompt,
				origin: "chat",
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
			return `Saved the new prompt for ${updateTopicPromptResult.topicName}.`
		},
	})
}

// the tool that changes the topic's fields
function toUpdateTopicFieldsTool({ userId, topicId, toolCalls, analyticsProperties }: EditTopicToolBinding): Tool {
	return tool({
		description: `Change the topic's title, its tags, its visibility (public, invite, or private), how often it brews (daily, weekdays, or weekly), the time of day it brews as HH:MM and the day a weekly brew runs, or how many findings a brew keeps (5, 10, 15, or 20).${toPodcastFieldDescription()} Name only the fields to change. ${CONFIRMATION_RULE}`,
		inputSchema: z.object(toUpdateTopicFieldsShape()),
		execute: async (topicFields) => {
			toolCalls.count += 1
			const updateTopicFieldsResult = await updateTopicFields({
				userId,
				topicId,
				topicFields,
				promptVersionOrigin: "chat",
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
			return `Saved the settings for ${updateTopicFieldsResult.topicName}.`
		},
	})
}

// the tool that adds a source
function toAddTopicSourceTool({ userId, topicId, toolCalls, analyticsProperties }: EditTopicToolBinding): Tool {
	return tool({
		description: `Add somewhere to read for this topic: a default source key, or a custom source option with its value. Returns what one more source is projected to cost. ${CONFIRMATION_RULE}`,
		inputSchema: addTopicSourcePayload,
		execute: async ({ sourceOption, value }) => {
			// count the call before the write. a failed write still counts
			toolCalls.count += 1
			const addTopicSourceResult = await addTopicSource({
				userId,
				topicId,
				sourceOption,
				value,
				origin: "chat",
				analyticsProperties,
			})
			// list the save, or what stopped it, for the toast
			if (addTopicSourceResult.status === "saved") {
				toolCalls.topicSaves.push(`Carl added ${addTopicSourceResult.topicSourceLabel}.`)
			} else {
				toolCalls.topicSaveRejections.push(toAddTopicSourceToast(addTopicSourceResult))
			}
			return toAddTopicSourceText(addTopicSourceResult)
		},
	})
}

// the tool that removes a source
function toRemoveTopicSourceTool({ userId, topicId, toolCalls, analyticsProperties }: EditTopicToolBinding): Tool {
	return tool({
		description: `Drop one of this topic's sources by the id shown in brackets after it in the sources block. ${CONFIRMATION_RULE}`,
		inputSchema: removeTopicSourcePayload,
		execute: async ({ sourceId }) => {
			// count the call before the write. a failed write still counts
			toolCalls.count += 1
			const removeTopicSourceResult = await removeTopicSource({
				userId,
				topicId,
				sourceId,
				origin: "chat",
				analyticsProperties,
			})
			if (removeTopicSourceResult.status !== "saved") {
				toolCalls.topicSaveRejections.push(
					toRejectionToast("remove that source", toGateReason(removeTopicSourceResult.status)),
				)
				return toRejectionText(removeTopicSourceResult.status)
			}
			// skip the toast for a row already gone
			if (!removeTopicSourceResult.topicSourceLabel) {
				return "That source was already gone."
			}
			toolCalls.topicSaves.push(`Carl removed ${removeTopicSourceResult.topicSourceLabel}.`)
			return `Removed ${removeTopicSourceResult.topicSourceLabel}.`
		},
	})
}

/**
 * Words addTopicSource's result as the text the tool returns and carl repeats.
 */
export function toAddTopicSourceText(addTopicSourceResult: Awaited<ReturnType<typeof addTopicSource>>): string {
	switch (addTopicSourceResult.status) {
		// the source and the cost it adds
		case "saved":
			return `Added ${addTopicSourceResult.topicSourceLabel}. About ${addTopicSourceResult.topicSourceCostDelta.perScanCents}¢ more a brew, around ${addTopicSourceResult.topicSourceCostDelta.perMonthCents}¢ a month at this topic's frequency. No brew started.`
		// a source the topic already reads
		case "present":
			return `This topic already reads ${addTopicSourceResult.topicSourceLabel}.`
		// a value the registry could not build a source from
		case "invalid":
			return "That value is not something the source option can read. Ask the reader for the url, handle, or id."
		// a topic at its source limit
		case "limit":
			return `This topic already holds ${addTopicSourceResult.limit} sources, the most a topic can. Drop one first.`
		// the gate's rejections
		default:
			return toRejectionText(addTopicSourceResult.status)
	}
}

/**
 * Words the gate's rejections plainly.
 */
export function toRejectionText(status: "missing" | "forbidden"): string {
	return status === "missing" ? "That topic is not there." : "The reader may not change this topic."
}

/**
 * The words for a rejected settings save, returned by the tool and repeated by carl.
 */
export function toUpdateTopicFieldsText(
	updateTopicFieldsResult: Exclude<UpdateTopicFieldsResult, { status: "saved" }>,
): string {
	if (updateTopicFieldsResult.status === "empty") {
		return "Name at least one field: the title, the tags, the visibility, how often it brews, when it brews, or how many findings a brew keeps."
	}

	// explain the plan's daily limit or the gate's rejection
	return updateTopicFieldsResult.status === "dailyFrequency"
		? `A daily topic does not fit the plan right now. The limit is ${updateTopicFieldsResult.limit}.`
		: toRejectionText(updateTopicFieldsResult.status)
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

/**
 * Returns the toast a rejected change shows: what carl could not do, and why.
 */
export function toRejectionToast(action: string, rejectionReason: string): string {
	return `Carl couldn't ${action}. ${rejectionReason}`
}

// why the gate said no, in the reader's own terms
function toGateReason(status: "missing" | "forbidden"): string {
	return status === "missing" ? "That topic isn't there." : "You may not edit this topic."
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

// a create rejection that names nothing, and the line each one shows
type PlainCreateRejection = Exclude<
	CreateTopicFromDraftResult,
	{ status: "created" | "invalid" | "limit" | "inviteeRejected" }
>
// the line each one shows
export const CREATE_REJECTION_LINES: Record<PlainCreateRejection["status"], string> = {
	forbidden: "Please log in and try again.",
	incomplete: "The draft needs a title and a prompt.",
	quota: "Your plan holds all the topics it allows.",
	dailyFrequency: "A daily topic doesn't fit the plan right now.",
	inviteLimit: "That many invites is past the plan's limit.",
}
