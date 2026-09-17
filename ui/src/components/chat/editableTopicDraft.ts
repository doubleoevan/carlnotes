import type { ProposeTopicEditPayload, TopicDraft, TopicResponse } from "@shared/contracts"
import { CUSTOM_SOURCE_OPTIONS, DEFAULT_SOURCES } from "@shared/sources"

// the fields of a topic the card shows
export type EditableTopicFields = Pick<
	TopicResponse,
	| "name"
	| "prompt"
	| "visibility"
	| "team"
	| "tags"
	| "frequency"
	// the schedule reads as two fields, the time of day and the day a weekly scan runs
	| "scheduledTime"
	| "scheduledDayOfWeek"
	| "maxTopicFindings"
> & {
	sources: Pick<TopicResponse["sources"][number], "id" | "sourceKind" | "summary">[]
	invites: Pick<TopicResponse["invites"][number], "email">[]
}

/**
 * A topic's fields in the card's shape, with each source as its option key and summary, the team it is on,
 * and its email invites. A source of a kind no option offers is left out. Given a proposal, the topic reads as it
 * would with that change applied.
 */
export function toEditableTopicDraft(
	topic: EditableTopicFields,
	proposedTopicEdit?: ProposeTopicEditPayload | null,
): TopicDraft {
	// drop the sources the proposal would remove, then add the ones it would add
	const removedSourceIds = new Set(proposedTopicEdit?.removeSourceIds ?? [])
	const keptSources = topic.sources
		.filter((topicSource) => !removedSourceIds.has(topicSource.id))
		.flatMap((topicSource) => {
			const sourceOptionKey = toSourceOptionKey(topicSource.sourceKind)
			return sourceOptionKey ? [{ sourceOption: sourceOptionKey, value: topicSource.summary }] : []
		})
	return {
		name: proposedTopicEdit?.name ?? topic.name,
		prompt: proposedTopicEdit?.prompt ?? topic.prompt,
		sources: [...keptSources, ...(proposedTopicEdit?.addSources ?? [])],
		inviteEmails: topic.invites.flatMap((invite) => (invite.email ? [invite.email] : [])),
		visibility: proposedTopicEdit?.visibility ?? topic.visibility,
		team: topic.team ? { teamId: topic.team.teamId, name: topic.team.name } : null,
		tags: proposedTopicEdit?.tags ?? topic.tags,
		frequency: proposedTopicEdit?.frequency ?? topic.frequency,
		scheduledTime: proposedTopicEdit?.scheduledTime ?? topic.scheduledTime,
		scheduledDayOfWeek: proposedTopicEdit?.scheduledDayOfWeek ?? topic.scheduledDayOfWeek,
		maxTopicFindings: proposedTopicEdit?.maxTopicFindings ?? topic.maxTopicFindings,
	}
}

// the option key that saves a source of this kind, or null for a kind no option offers
function toSourceOptionKey(sourceKind: string): TopicDraft["sources"][number]["sourceOption"] | null {
	const sourceOption = [...DEFAULT_SOURCES, ...CUSTOM_SOURCE_OPTIONS].find((option) => option.sourceKind === sourceKind)
	return sourceOption?.key ?? null
}
