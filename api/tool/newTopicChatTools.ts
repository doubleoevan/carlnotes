// the new-topic chat's own tools: writing the topic draft, suggesting its sources, and proposing the topic, and the
// create that an agreed proposal runs
import { MAX_DRAFT_INVITES, MAX_TOPIC_SOURCES, TOPIC_NAME_CHARS, TOPIC_PROMPT_CHARS } from "@shared/contracts/topics"
import { isPodcastEpisodeRecordingConfigured } from "@shared/podcastEpisodes"
import {
	addTopicSourcePayload,
	type TopicDraft,
	topicDraftTeamPayload,
	topicSettingsShape,
} from "@shared/topicPayloads"
import { type Tool, tool } from "ai"
import { z } from "zod"
import type { AnalyticsProperties } from "../currentUser"
import { deleteTopicDraft } from "../topic/topicDrafts"
import { type ChatTurnToolCalls, CREATE_REJECTION_LINES, toRejectionToast } from "./chatTools"
import {
	type CreateTopicFromDraftResult,
	createTopicFromDraft,
	type SuggestTopicDraftSourcesResult,
	suggestTopicDraftSources,
} from "./topicDraftTools"
import { toPodcastFieldDescription, toUpdateTopicFieldsShape } from "./topicTools"

// what one new-topic turn's tools are bound to: the user, the turn's draft, and what the tools leave for the toast
export type NewTopicToolBinding = {
	userId: string
	toolCalls: ChatTurnToolCalls
	topicDraft: TopicDraft
	analyticsProperties: AnalyticsProperties
}

// the topic draft fields one call may write. an omitted field keeps its value, so no default may stand in for one
const topicDraftFieldsPayload = z.object({
	...topicSettingsShape,
	// the topic draft's name, which may be empty here
	name: z.string().trim().max(TOPIC_NAME_CHARS).optional(),
	prompt: z.string().trim().max(TOPIC_PROMPT_CHARS).optional(),
	sources: z.array(addTopicSourcePayload).max(MAX_TOPIC_SOURCES).optional(),
	inviteEmails: z.array(z.string().trim().toLowerCase().pipe(z.email())).max(MAX_DRAFT_INVITES).optional(),
	team: topicDraftTeamPayload.nullable().optional(),
})

/**
 * Binds the new-topic chat's saving tool to this chat turn's topic draft. draftTopic writes into that draft.
 */
export function toNewTopicChatTools(newTopicToolBinding: NewTopicToolBinding): Record<string, Tool> {
	return { draftTopic: toDraftTopicTool(newTopicToolBinding) }
}

/**
 * Builds the tool that proposes creating the topic from the draft as this turn leaves it. It saves nothing, so it is
 * not bound with the saving tools. The server records the draft, and creates the topic only if the user's next message
 * agrees to it.
 */
export function toProposeNewTopicTool(): Tool {
	return tool({
		description:
			"Propose creating the topic from the draft as it stands once this turn ends. Call this after you read the draft back, in the same turn, and again after any change to it. This creates nothing. The topic is created only if the reader's next message agrees.",
		inputSchema: z.object({}),
		execute: async () =>
			"The draft is proposed. Ask the reader whether to create it and wait. Nothing is created until their next message agrees.",
	})
}

// the tool that writes the topic draft. each call replaces the fields it names and saves the whole of it for the card
function toDraftTopicTool({ toolCalls, topicDraft }: NewTopicToolBinding): Tool {
	return tool({
		description: `Write what the reader has settled into the topic draft shown beside this chat: the title, the prompt, the sources as option and value pairs, who may read it as public, invite, or private, the team it joins as the id and name from the reader's teams, the tags, how often it brews, the time of day it brews as HH:MM and the day a weekly brew runs, how many findings a brew keeps, or the invite emails.${toPodcastFieldDescription()} Name only the fields to change: a field you leave out keeps what the draft already holds, so clear one by naming it empty, sources, tags and invites as an empty list, the title and prompt as an empty string, and the team as null. Call it as soon as an answer settles.`,
		inputSchema: topicDraftFieldsPayload.extend(toUpdateTopicFieldsShape()),
		execute: async (topicDraftFields) => {
			toolCalls.count += 1
			// the named fields replace the topic draft's
			Object.assign(
				topicDraft,
				Object.fromEntries(Object.entries(topicDraftFields).filter(([, value]) => value !== undefined)),
			)

			// a new topic's podcast starts on, on an instance where podcast episodes are recorded
			if (isPodcastEpisodeRecordingConfigured() && topicDraft.isPodcastEnabled === undefined) {
				topicDraft.isPodcastEnabled = true
			}
			toolCalls.topicDraft = { ...topicDraft }
			return `The draft now reads: ${toTopicDraftSummary(topicDraft)}`
		},
	})
}

/**
 * Builds the tool that suggests sources for a topic draft. It saves nothing, so it is not bound with the saving tools.
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

// what createTopic returns for a public or invite draft that names no team
export const TEAM_MISSING_TEXT =
	"A public or invite topic goes on a team. Ask which of the reader's teams it goes on, or make it private, then create again. Nothing was created."

/**
 * Creates the topic from the topic draft as it stands, listing the save or what stopped it for the toast, and returns
 * what carl reads.
 */
export async function createTopicInChat({
	userId,
	toolCalls,
	topicDraft,
	analyticsProperties,
}: NewTopicToolBinding): Promise<string> {
	toolCalls.count += 1

	// create nothing for a public or invite draft that names no team, and have carl ask which team
	if (topicDraft.visibility !== "private" && !topicDraft.team) {
		return TEAM_MISSING_TEXT
	}
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
			toRejectionToast(`add it to ${createTopicFromDraftResult.teamName}`, createTopicFromDraftResult.addTeamRejection),
		)
	}
	// word the result for carl
	return toCreateTopicText(createTopicFromDraftResult)
}

/**
 * Returns the topic draft in one line.
 */
export function toTopicDraftSummary(topicDraft: TopicDraft): string {
	const topicSources = topicDraft.sources
		.map((topicSource) => `${topicSource.sourceOption} ${topicSource.value}`.trim())
		.join(", ")

	// the podcast setting, on an instance where podcast episodes are recorded
	const podcastSummary =
		topicDraft.isPodcastEnabled === undefined ? "" : `, podcast ${topicDraft.isPodcastEnabled ? "on" : "off"}`
	return `title "${topicDraft.name}", prompt "${topicDraft.prompt}", sources [${topicSources}], visibility ${topicDraft.visibility}, team ${topicDraft.team?.name ?? "none"}, tags [${topicDraft.tags.join(", ")}], brews ${topicDraft.frequency}, keeps ${topicDraft.maxTopicFindings}, invites [${topicDraft.inviteEmails.join(", ")}]${podcastSummary}.`
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
