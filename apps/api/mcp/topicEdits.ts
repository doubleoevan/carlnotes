// the mcp edit_topic tool's flow: read the topic as its page does, preview an edit that needs the user's agreement,
// and save every other edit, or a confirmed one, through the chat's own save path

import type { ChatToolCall } from "@carlnotes/contracts/payloads"
import { type EditableTopicFields, toEditableTopicDraft } from "@carlnotes/contracts/topicEdits"
import type { ProposeTopicEditPayload, TopicDraft } from "@carlnotes/contracts/topicPayloads"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { trackEvent } from "@carlnotes/server/analytics"
import type { AnalyticsProperties } from "../currentUser"
import { addTopicToTeam, removeTopicFromTeam } from "../team/teams"
import { toEmptyChatTurnToolCalls, toRejectionToast } from "../tool/chatTools"
import { applyTopicEditSaves, type TopicEditSaveBinding, toTopicEditRejectionCall } from "../tool/topicEditSaves"
import { loadTopicPage } from "../topic/topics"
import {
	isTopicEditConfirmed,
	type TopicEditConfirmationReason,
	type TopicTeamChange,
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

// a previewed edit: what needs the user's agreement, the sources it would remove, each change worded for the user, and
// the confirmation that saves it
type PreviewedEditTopicResult = EditTopicResultTopic & {
	status: "confirmRequired"
	topicEditConfirmationReasons: TopicEditConfirmationReason[]
	removeSourceIds: string[]
	topicEditChanges: string[]
	confirmation: string
}

// what an edit did: saved, previewed, or rejected before anything was read
export type EditTopicResult =
	| SavedEditTopicResult
	| PreviewedEditTopicResult
	| { status: "missing" }
	| { status: "forbidden" }

// who saves, the topic and its edit, the team change, the confirmation a previous call returned, and the request's
// analytics properties
export type EditTopicOptions = {
	userId: string
	topicId: string
	topicEdit: ProposeTopicEditPayload
	topicTeamChange: TopicTeamChange | null
	confirmation: string | null
	analyticsProperties: AnalyticsProperties
}

/**
 * Saves a topic edit through the chat's save path. An edit that makes the topic public, removes a source, or shares a
 * private topic with a team saves only with a confirmation issued for that edit over the topic as it stands, and
 * otherwise returns its preview.
 */
export async function editTopic({
	userId,
	topicId,
	topicEdit,
	topicTeamChange,
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
	const topicEditConfirmationOptions = { userId, topicId, topicEdit, topicTeamChange, editableTopicFields }
	const topicEditConfirmationReasons = toTopicEditConfirmationReasons(topicEditConfirmationOptions)
	const isConfirmed = confirmation !== null && isTopicEditConfirmed(topicEditConfirmationOptions, confirmation)
	if (topicEditConfirmationReasons.length > 0 && !isConfirmed) {
		// the preview: the topic after the edit, each change in words, and the confirmation that saves it
		const removeSourceIds = topicEdit.removeSourceIds ?? []
		return {
			status: "confirmRequired",
			...toEditTopicResultTopic(topicPage, toEditableTopicDraft(editableTopicFields, topicEdit)),
			topicEditConfirmationReasons,
			removeSourceIds,
			topicEditChanges: toTopicEditChanges({
				topicEditConfirmationReasons,
				topicSources: editableTopicFields.sources,
				removeSourceIds,
			}),
			confirmation: toTopicEditConfirmation(topicEditConfirmationOptions),
		}
	}

	// the editor's check first. a rejected edit saves nothing, the team change included
	const toolCalls = toEmptyChatTurnToolCalls()
	const topicEditSaveBinding = { userId, topicId, origin: "mcp" as const, toolCalls, analyticsProperties }
	const topicEditRejectionCall = await toTopicEditRejectionCall(topicEditSaveBinding, topicEdit)

	// save through the chat's path, which lists each save and each rejection, then the team change
	const serverToolCalls = topicEditRejectionCall
		? [topicEditRejectionCall]
		: [
				...(await applyTopicEditSaves(topicEditSaveBinding, topicEdit)),
				...(topicTeamChange ? [await saveTopicTeamChange(topicEditSaveBinding, topicTeamChange)] : []),
			]
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
 * Returns a topic page's fields in the shape the topic MCP view previews an edit over.
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

// each change that needs the user's agreement in words, a removed source named by its kind and summary
function toTopicEditChanges({
	topicEditConfirmationReasons,
	topicSources,
	removeSourceIds,
}: {
	topicEditConfirmationReasons: TopicEditConfirmationReason[]
	topicSources: EditTopicResultTopic["topicSources"]
	removeSourceIds: string[]
}): string[] {
	// the removed sources' labels, then each change in the order the reasons list them
	const removedSourceLabels = topicSources
		.filter((topicSource) => removeSourceIds.includes(topicSource.id))
		.map((topicSource) => `${topicSource.sourceKind} ${topicSource.summary}`.trim())
	return [
		...(topicEditConfirmationReasons.includes("goesPublic") ? ["makes the topic public, so anyone can read it"] : []),
		...(topicEditConfirmationReasons.includes("removesSources") ? [`removes ${removedSourceLabels.join(", ")}`] : []),
		...(topicEditConfirmationReasons.includes("sharesWithTeam")
			? ["shares the topic with the team, so its members can read it"]
			: []),
	]
}

// add the topic to a team or take it off, through the team page's own rules, and list the change or its rejection
async function saveTopicTeamChange(
	{ userId, topicId, toolCalls, analyticsProperties }: TopicEditSaveBinding,
	{ teamId, isOnTeam }: TopicTeamChange,
): Promise<ChatToolCall> {
	// a leader adds a topic they can read, and a leader or the topic's owner takes it off
	const editTopicTeamToolCall = { toolName: "editTopicTeam", input: { teamId, isOnTeam } }
	const { output: teamChangeOutput, isSaved } = isOnTeam
		? toAddedTopicTeamOutput(await addTopicToTeam(userId, teamId, topicId))
		: (await removeTopicFromTeam(userId, teamId, topicId))
			? { output: TEAM_CHANGE_SAVED_LINES.removed, isSaved: true }
			: { output: TEAM_CHANGE_REJECTED_LINES.removeForbidden, isSaved: false }

	// a saved change is listed with its event, and a rejected one for the toast
	if (isSaved) {
		toolCalls.topicSaves.push(teamChangeOutput)
		trackEvent(isOnTeam ? "team_topic_added" : "team_topic_removed", userId, {
			...analyticsProperties,
			teamId,
			topicId,
		})
	} else {
		toolCalls.topicSaveRejections.push(
			toRejectionToast(isOnTeam ? "add it to the team" : "take it off the team", teamChangeOutput),
		)
	}
	return { ...editTopicTeamToolCall, output: teamChangeOutput }
}

// the lines a team change shows
const TEAM_CHANGE_SAVED_LINES = { added: "Added the topic to the team.", removed: "Took the topic off the team." }
const TEAM_CHANGE_REJECTED_LINES = {
	alreadyAdded: "That team already has this topic.",
	addForbidden: "Only the team's leader adds a topic, and a private topic stays with its owner.",
	removeForbidden: "Only the team's leader or the topic's owner takes a topic off a team.",
}

// a team change's line, and whether the change saved
type TopicTeamChangeOutput = { output: string; isSaved: boolean }

// the line an add returns, and whether the add saved
function toAddedTopicTeamOutput(addTopicResult: Awaited<ReturnType<typeof addTopicToTeam>>): TopicTeamChangeOutput {
	switch (addTopicResult) {
		case "added":
			return { output: TEAM_CHANGE_SAVED_LINES.added, isSaved: true }
		case "alreadyAdded":
			return { output: TEAM_CHANGE_REJECTED_LINES.alreadyAdded, isSaved: false }
		// a member who is not the leader, or a topic they may not hand over
		case "forbidden":
			return { output: TEAM_CHANGE_REJECTED_LINES.addForbidden, isSaved: false }
	}
}
