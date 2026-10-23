// the chat adapters for a topic: the preview tools, the in-chat saves the server applies, and the wording every
// adapter shares
import type { TopicToolCalls } from "@carlnotes/contracts/chat"
import { proposeTopicEditPayload } from "@carlnotes/contracts/topicPayloads"
import { type Tool, tool } from "ai"
import { z } from "zod"
import type { CreateTopicFromDraftResult } from "./topicDraftTools"
import type { addTopicSource, RemoveTopicSourceResult } from "./topicSourceTools"
import type { UpdateTopicFieldsResult } from "./topicTools"

// what the topic tools did in one chat turn: what the api client is told, plus how many tools were called
export type ChatTurnToolCalls = TopicToolCalls & { count: number }

/**
 * Returns a fresh record of one chat turn's tool calls, with no tool called yet.
 */
export function toEmptyChatTurnToolCalls(): ChatTurnToolCalls {
	return { count: 0, topicSaves: [], topicSaveRejections: [] }
}

// what cancelling a proposed change returns, whether carl cancels it or the user's message declines it
export const TOPIC_EDIT_CANCELLED_TEXT = "The preview is off the card. The topic reads as it is saved."

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
 * Returns the pair of tools that put a proposed change on the topic's card and take it back off.
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
			return TOPIC_EDIT_CANCELLED_TEXT
		},
	})
}

/**
 * Returns what carl reads after the topic prompt is saved.
 */
export function toSavedTopicPromptText(topicName: string): string {
	return `Saved the new prompt for ${topicName}.`
}

/**
 * Returns what carl reads after the topic's settings are saved.
 */
export function toSavedTopicFieldsText(topicName: string): string {
	return `Saved the settings for ${topicName}.`
}

/**
 * Returns the text for removeTopicSource's result.
 */
export function toRemoveTopicSourceText(removeTopicSourceResult: RemoveTopicSourceResult): string {
	switch (removeTopicSourceResult.status) {
		// name the removed source, or say it was already gone
		case "saved":
			return removeTopicSourceResult.topicSourceLabel
				? `Removed ${removeTopicSourceResult.topicSourceLabel}.`
				: "That source was already gone."
		// say which rule kept the source, or why the gate said no
		case "lastSource":
			return "That is the topic's last source, and a topic keeps at least one. Add another source before removing it."
		case "webSearch":
			return "Web search stays on the topic here. The owner can turn it off in the topic editor."
		default:
			return toRejectionText(removeTopicSourceResult.status)
	}
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

/**
 * Returns the toast a rejected change shows: what carl could not do, and why.
 */
export function toRejectionToast(action: string, rejectionReason: string): string {
	return `Carl couldn't ${action}. ${rejectionReason}`
}

/**
 * Returns why the gate said no, in the reader's own terms.
 */
export function toGateReason(status: "missing" | "forbidden"): string {
	return status === "missing" ? "That topic isn't there." : "You may not edit this topic."
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
