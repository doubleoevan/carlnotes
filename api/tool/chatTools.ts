// the chat adapters: the topic tools bound to one chat turn's topic, and the new-topic chat's own tools
import {
	addTopicSourcePayload,
	MAX_DRAFT_INVITES,
	MAX_TOPIC_SOURCES,
	proposeTopicEditPayload,
	removeTopicSourcePayload,
	TOPIC_NAME_CHARS,
	TOPIC_PROMPT_CHARS,
	type TopicDraft,
	type TopicToolCalls,
	topicDraftTeamPayload,
	updateTopicFieldsPayload,
	updateTopicPromptPayload,
} from "@shared/contracts"
import { type Tool, tool } from "ai"
import { z } from "zod"
import type { AnalyticsProperties } from "../currentUser"
import { deleteTopicDraft } from "../topic/topicDrafts"
import {
	type AddTopicSourceResult,
	addTopicSource,
	type CreateTopicFromDraftResult,
	createTopicFromDraft,
	removeTopicSource,
	type SuggestTopicDraftSourcesResult,
	suggestTopicDraftSources,
	type UpdateTopicFieldsResult,
	updateTopicFields,
	updateTopicPrompt,
} from "./topicTools"

// what the topic tools did in one chat turn: what the api client is told, plus how many tools were called
export type ChatTurnToolCalls = TopicToolCalls & { count: number }

// the confirmation rule every tool description ends with
const CONFIRMATION_RULE =
	"Call this only in a turn after the reader said yes to the exact change you proposed in an earlier turn."

// what one chat turn's tools are bound to
type EditTopicToolBinding = { userId: string; topicId: string; toolCalls: ChatTurnToolCalls }

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
function toUpdateTopicPromptTool({ userId, topicId, toolCalls }: EditTopicToolBinding): Tool {
	return tool({
		description: `Rewrite what the reader is looking for, the prompt every brew scores against. ${CONFIRMATION_RULE}`,
		inputSchema: updateTopicPromptPayload,
		execute: async ({ prompt }) => {
			// count the call before the write. a failed write still counts
			toolCalls.count += 1
			const updateTopicPromptResult = await updateTopicPrompt({ userId, topicId, prompt, origin: "chat" })
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
function toUpdateTopicFieldsTool({ userId, topicId, toolCalls }: EditTopicToolBinding): Tool {
	return tool({
		description: `Change the topic's title, its tags, its visibility (public, invite, or private), how often it brews (daily, weekdays, or weekly), the time of day it brews as HH:MM and the day a weekly brew runs, or how many findings a brew keeps (5, 10, 15, or 20). Name only the fields to change. ${CONFIRMATION_RULE}`,
		inputSchema: updateTopicFieldsPayload,
		execute: async (topicFields) => {
			toolCalls.count += 1
			const updateTopicFieldsResult = await updateTopicFields({
				userId,
				topicId,
				topicFields,
				promptVersionOrigin: "chat",
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
function toAddTopicSourceTool({ userId, topicId, toolCalls }: EditTopicToolBinding): Tool {
	return tool({
		description: `Add somewhere to read for this topic: a default source key, or a custom source option with its value. Returns what one more source is projected to cost. ${CONFIRMATION_RULE}`,
		inputSchema: addTopicSourcePayload,
		execute: async ({ sourceOption, value }) => {
			// count the call before the write. a failed write still counts
			toolCalls.count += 1
			const addTopicSourceResult = await addTopicSource({ userId, topicId, sourceOption, value, origin: "chat" })
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
function toRemoveTopicSourceTool({ userId, topicId, toolCalls }: EditTopicToolBinding): Tool {
	return tool({
		description: `Drop one of this topic's sources by the id shown in brackets after it in the sources block. ${CONFIRMATION_RULE}`,
		inputSchema: removeTopicSourcePayload,
		execute: async ({ sourceId }) => {
			// count the call before the write. a failed write still counts
			toolCalls.count += 1
			const removeTopicSourceResult = await removeTopicSource({ userId, topicId, sourceId, origin: "chat" })
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

// what one new-topic turn's tools are bound to: the user, the turn's draft, and what the tools leave for the toast
type NewTopicToolBinding = {
	userId: string
	toolCalls: ChatTurnToolCalls
	topicDraft: TopicDraft
	analyticsProperties: AnalyticsProperties
}

// the topic draft fields one call may write. an omitted field keeps its value, so no default may stand in for one
const topicDraftFieldsPayload = z.object({
	...updateTopicFieldsPayload.shape,
	// the topic draft's name, which may be empty here
	name: z.string().trim().max(TOPIC_NAME_CHARS).optional(),
	prompt: z.string().trim().max(TOPIC_PROMPT_CHARS).optional(),
	sources: z.array(addTopicSourcePayload).max(MAX_TOPIC_SOURCES).optional(),
	inviteEmails: z.array(z.string().trim().toLowerCase().pipe(z.email())).max(MAX_DRAFT_INVITES).optional(),
	team: topicDraftTeamPayload.nullable().optional(),
})

/**
 * Binds the new-topic chat's tools to this chat turn's topic draft.
 * draftTopic writes into that draft, and createTopic makes the topic from it.
 */
export function toNewTopicChatTools(newTopicToolBinding: NewTopicToolBinding): Record<string, Tool> {
	return {
		draftTopic: toDraftTopicTool(newTopicToolBinding),
		createTopic: toCreateTopicTool(newTopicToolBinding),
	}
}

// the tool that writes the topic draft. each call replaces the fields it names and saves the whole of it for the card
function toDraftTopicTool({ toolCalls, topicDraft }: NewTopicToolBinding): Tool {
	return tool({
		description:
			"Write what the reader has settled into the topic draft shown beside this chat: the title, the prompt, the sources as option and value pairs, who may read it as public, invite, or private, the team it joins as the id and name from the reader's teams, the tags, how often it brews, the time of day it brews as HH:MM and the day a weekly brew runs, how many findings a brew keeps, or the invite emails. Name only the fields to change: a field you leave out keeps what the draft already holds, so clear one by naming it empty, sources, tags and invites as an empty list, the title and prompt as an empty string, and the team as null. Call it as soon as an answer settles.",
		inputSchema: topicDraftFieldsPayload,
		execute: async (topicDraftFields) => {
			toolCalls.count += 1
			// the named fields replace the topic draft's
			Object.assign(
				topicDraft,
				Object.fromEntries(Object.entries(topicDraftFields).filter(([, value]) => value !== undefined)),
			)
			toolCalls.topicDraft = { ...topicDraft }
			return `The draft now reads: ${toTopicDraftSummary(topicDraft)}`
		},
	})
}

/**
 * Builds the tool that suggests sources for a topic draft. It saves nothing, so it is not bound with the saving tools.
 * Those are the only ones toConsentStep may force, and fetching suggestions must never answer a yes.
 */
export function toSuggestTopicSourcesTool({ userId, toolCalls }: NewTopicToolBinding): Tool {
	return tool({
		description:
			"Suggest verified sources for a title and prompt, each as the option and value the draft takes. Offer them to the reader, then write the ones they pick into the draft.",
		inputSchema: z.object({ name: z.string().trim().min(1), prompt: z.string().trim().min(1) }),
		execute: async ({ name, prompt }) => {
			toolCalls.count += 1
			// suggest the sources, and toast a limit or a gate that stopped them
			const suggestTopicDraftSourcesResult = await suggestTopicDraftSources({ userId, name, prompt })
			if (suggestTopicDraftSourcesResult.status !== "ok") {
				const rejectionReason =
					suggestTopicDraftSourcesResult.status === "limit"
						? "Today's limit is used up."
						: "Please log in and try again."
				toolCalls.topicSaveRejections.push(toRejectionToast("fetch suggestions", rejectionReason))
			}
			// word the result for carl
			return toSuggestionsText(suggestTopicDraftSourcesResult)
		},
	})
}

// the tool that creates the topic from the topic draft as it stands
function toCreateTopicTool({ userId, toolCalls, topicDraft, analyticsProperties }: NewTopicToolBinding): Tool {
	return tool({
		description: `Create the topic from the draft as it stands, with a first brew. ${CONFIRMATION_RULE}`,
		inputSchema: z.object({}),
		execute: async () => {
			toolCalls.count += 1
			const createTopicFromDraftResult = await createTopicFromDraft({
				userId,
				topicDraft: topicDraft,
				origin: "chat",
				analyticsProperties,
			})
			// what stopped the create, for the toast
			if (createTopicFromDraftResult.status !== "created") {
				toolCalls.topicSaveRejections.push(
					toRejectionToast("create the topic", toCreateTopicReason(createTopicFromDraftResult)),
				)
				return toCreateTopicText(createTopicFromDraftResult)
			}
			// list the save and the created topic for the toast
			toolCalls.topicSaves.push(`Carl created ${createTopicFromDraftResult.name}.`)
			toolCalls.createdTopicId = createTopicFromDraftResult.topicId
			// delete the topic draft now that the topic exists
			await deleteTopicDraft(userId).catch((error) => {
				console.error("topic draft delete failed", error)
			})
			// a rejected team add gets its own toast
			if (createTopicFromDraftResult.addTeamRejection) {
				toolCalls.topicSaveRejections.push(
					toRejectionToast(
						`add it to ${createTopicFromDraftResult.teamName}`,
						createTopicFromDraftResult.addTeamRejection,
					),
				)
			}
			// word the result for carl
			return toCreateTopicText(createTopicFromDraftResult)
		},
	})
}

// the topic draft in one line, so carl can read back what stands
function toTopicDraftSummary(topicDraft: TopicDraft): string {
	const topicSources = topicDraft.sources
		.map((topicSource) => `${topicSource.sourceOption} ${topicSource.value}`.trim())
		.join(", ")
	return `title "${topicDraft.name}", prompt "${topicDraft.prompt}", sources [${topicSources}], visibility ${topicDraft.visibility}, team ${topicDraft.team?.name ?? "none"}, tags [${topicDraft.tags.join(", ")}], brews ${topicDraft.frequency}, keeps ${topicDraft.maxTopicFindings}, invites [${topicDraft.inviteEmails.join(", ")}].`
}

/**
 * Words suggestTopicDraftSources' result as the text the tool returns and carl repeats.
 */
export function toSuggestionsText(suggestTopicDraftSourcesResult: SuggestTopicDraftSourcesResult): string {
	switch (suggestTopicDraftSourcesResult.status) {
		// the suggestions, each as the pair the topic draft takes
		case "ok":
			return suggestTopicDraftSourcesResult.sources.length === 0
				? "No source came back verified. Propose from what you know and the web search, and say each is unverified."
				: suggestTopicDraftSourcesResult.sources
						.map(
							(topicSource) =>
								`- ${topicSource.sourceOption} ${topicSource.value}${topicSource.name ? ` (${topicSource.name})` : ""}`,
						)
						.join("\n")
		// today's suggestions are used up
		case "limit":
			return "Today's suggestion limit is used up. Propose from what you know and the web search, and say each is unverified."
		// the gate's rejection
		default:
			return "The reader may not ask for suggestions."
	}
}

/**
 * Words createTopicFromDraft's result as the text the tool returns and carl repeats.
 */
export function toCreateTopicText(createTopicFromDraftResult: CreateTopicFromDraftResult): string {
	switch (createTopicFromDraftResult.status) {
		// the topic, its first scan already under way
		case "created":
			return `Created ${createTopicFromDraftResult.name}. Its first brew is under way, and the reader is being taken to it.${toAddTeamText(createTopicFromDraftResult)}`
		// a topic draft not ready to save
		case "incomplete":
			return "The draft needs a title and a prompt first. Write them with draftTopic."
		// a source the registry could not build
		case "invalid":
			return `That source cannot be read: ${createTopicFromDraftResult.value}. Fix it or drop it from the draft, then create again.`
		// more sources than a topic holds, the default web search counted
		case "limit":
			return `That is more than the ${createTopicFromDraftResult.limit} sources a topic holds, the default web search counted. Drop one from the draft, then create again.`
		// the create path's own rejections
		case "quota":
			return "The reader has reached their plan's topic limit. Nothing was created."
		case "dailyFrequency":
			return `A daily topic does not fit the plan right now. The limit is ${createTopicFromDraftResult.limit}.`
		// the invite checks
		case "inviteeRejected":
			return `${createTopicFromDraftResult.email} does not take invites. Drop that address from the draft, then create again.`
		case "inviteLimit":
			return "That many invites is past the plan's limit. Trim the invite list, then create again."
		// the gate's rejection
		default:
			return "The reader may not create a topic."
	}
}

// what the create says about the topic draft's team: on it, not added and why, or nothing when none was named
function toAddTeamText({
	teamName,
	addTeamRejection,
}: {
	teamName: string | null
	addTeamRejection: string | null
}): string {
	// nothing when the topic draft named no team
	if (!teamName) {
		return ""
	}
	return addTeamRejection ? ` It was not added to ${teamName}: ${addTeamRejection}` : ` It is on ${teamName}.`
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
	return updateTopicFieldsResult.status === "dailyFrequency"
		? CREATE_REJECTION_LINES.dailyFrequency
		: toGateReason(updateTopicFieldsResult.status)
}

// the toast a rejected change shows: what carl could not do, and why
function toRejectionToast(action: string, rejectionReason: string): string {
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
const CREATE_REJECTION_LINES: Record<PlainCreateRejection["status"], string> = {
	forbidden: "Please log in and try again.",
	incomplete: "The draft needs a title and a prompt.",
	quota: "Your plan holds all the topics it allows.",
	dailyFrequency: "A daily topic doesn't fit the plan right now.",
	inviteLimit: "That many invites is past the plan's limit.",
}

/**
 * Words what stopped a create in the reader's own terms.
 */
export function toCreateTopicReason(
	createTopicFromDraftResult: Exclude<CreateTopicFromDraftResult, { status: "created" }>,
): string {
	// word the rejections that name a source, a limit, or an email
	switch (createTopicFromDraftResult.status) {
		case "invalid":
			return `That source can't be read: ${createTopicFromDraftResult.value}.`
		case "limit":
			return `That's more than the ${createTopicFromDraftResult.limit} sources a topic can have.`
		case "inviteeRejected":
			return `${createTopicFromDraftResult.email} doesn't take invites.`
		// the rest read from the map
		default:
			return CREATE_REJECTION_LINES[createTopicFromDraftResult.status]
	}
}
