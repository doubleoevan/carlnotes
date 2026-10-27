import { DEFAULT_SOURCES } from "@carlnotes/contracts/sources"
import type { TopicDraft } from "@carlnotes/contracts/topicPayloads"
import type { ComponentType, ReactNode } from "react"
import { toScheduleLabel } from "../lib/labels"

type Container = ComponentType<{ children: ReactNode }>
export type TopicDraftFile = { name: string; size: number; lastModified: number }
export type TopicDraftCardProps = {
	topicDraft: TopicDraft
	topicId?: string | null
	isTopicEditProposed?: boolean
	isCarlReplying?: boolean
	attachmentFiles?: TopicDraftFile[]
	onRemoveAttachmentFile?: (index: number) => void
	onDismissTopicEdit?: () => void
}
export type TopicDraftCardElements = {
	Frame: ComponentType<{ children: ReactNode; heading: string }>
	Scroll: ComponentType<{ children: ReactNode; topicDraft: TopicDraft }>
	HeadingRow: Container
	Heading: Container
	Dismiss: ComponentType<{ onDismiss: () => void }>
	Loading: ComponentType
	Name: ComponentType<{ name: string; topicId?: string | null }>
	Fields: Container
	Field: ComponentType<{ label: string; fieldText?: string; children: ReactNode }>
	List: ComponentType<{ items: string[]; isNumbered?: boolean }>
	Files: ComponentType<{ files: TopicDraftFile[]; onRemove?: (index: number) => void }>
}
const VISIBILITY_LABELS = { public: "Public", invite: "Shared by invite", private: "Private" }

/**
 * Shows the same complete Topic draft and proposed settings above either app's composer.
 */
export function TopicDraftCard({
	topicDraft,
	topicId,
	isTopicEditProposed = false,
	isCarlReplying = false,
	attachmentFiles = [],
	onRemoveAttachmentFile,
	onDismissTopicEdit,
	elements: { Frame, Scroll, HeadingRow, Heading, Dismiss, Loading, Name, Fields, Field, List, Files },
}: TopicDraftCardProps & { elements: TopicDraftCardElements }) {
	// a Team alone remains the empty draft after creating a Topic
	const isTopicDraftEmpty =
		!topicDraft.name &&
		!topicDraft.prompt &&
		!topicDraft.sources.length &&
		!topicDraft.inviteEmails.length &&
		!topicDraft.tags.length
	if (isTopicDraftEmpty && !attachmentFiles.length) {
		return null
	}
	// format the Topic draft fields
	const topicDraftHeading = topicId ? "Topic draft" : "Topic preview"
	const topicSourceLines = toTopicSourceLines({ topicDraft, isNewTopicDraft: !topicId })
	const topicTagLabel = topicDraft.tags.join(", ") || "None"
	const topicScheduleLabel = toScheduleLabel(
		topicDraft.frequency,
		topicDraft.scheduledTime,
		topicDraft.scheduledDayOfWeek,
	)
	return (
		<Frame heading={topicDraftHeading}>
			<Scroll topicDraft={topicDraft}>
				{/* heading */}
				<HeadingRow>
					<Heading>{topicDraftHeading}</Heading>
					{isTopicEditProposed && onDismissTopicEdit && <Dismiss onDismiss={onDismissTopicEdit} />}
				</HeadingRow>
				{isCarlReplying ? (
					<Loading />
				) : (
					<>
						{topicDraft.name && <Name key={topicDraft.name} name={topicDraft.name} topicId={topicId} />}
						{/* topic settings */}
						<Fields>
							{topicDraft.prompt && (
								<Field label="Carl's Prompt" fieldText={topicDraft.prompt}>
									{topicDraft.prompt}
								</Field>
							)}
							<Field label="Tags" fieldText={topicTagLabel}>
								{topicTagLabel}
							</Field>
							<Field label="Frequency" fieldText={topicScheduleLabel}>
								{topicScheduleLabel}
							</Field>
							<Field label="Max findings" fieldText={String(topicDraft.maxTopicFindings)}>
								{topicDraft.maxTopicFindings} findings per brew
							</Field>
							{topicDraft.isPodcastEnabled !== undefined && (
								<Field label="Podcast" fieldText={String(topicDraft.isPodcastEnabled)}>
									{topicDraft.isPodcastEnabled ? "Coffee Break episode after every brew" : "Off"}
								</Field>
							)}
							<Field label="Visibility" fieldText={topicDraft.visibility}>
								{VISIBILITY_LABELS[topicDraft.visibility]}
							</Field>
							{topicDraft.team && (
								<Field label="Team" fieldText={topicDraft.team.name}>
									{topicDraft.team.name}
								</Field>
							)}
							{topicDraft.inviteEmails.length > 0 && (
								<Field label="Invites" fieldText={topicDraft.inviteEmails.join(", ")}>
									<List items={topicDraft.inviteEmails} />
								</Field>
							)}
							{/* sources and files */}
							<Field label="Sources" fieldText={topicSourceLines.join(", ")}>
								<List items={topicSourceLines} isNumbered />
							</Field>
							{attachmentFiles.length > 0 && (
								<Field label="Files">
									<Files files={attachmentFiles} onRemove={onRemoveAttachmentFile} />
								</Field>
							)}
						</Fields>
					</>
				)}
			</Scroll>
		</Frame>
	)
}

// one line per source the topic would read, with the built-in sources a new topic's create will add
function toTopicSourceLines({
	topicDraft,
	isNewTopicDraft,
}: {
	topicDraft: TopicDraft
	isNewTopicDraft: boolean
}): string[] {
	const defaultSourceLabels = new Map<string, string>(
		DEFAULT_SOURCES.map((defaultSource) => [defaultSource.key, defaultSource.label]),
	)
	const topicDraftSourceLabels = topicDraft.sources.map(
		(topicSource) =>
			defaultSourceLabels.get(topicSource.sourceOption) ?? `${topicSource.sourceOption} ${topicSource.value}`.trim(),
	)
	if (!isNewTopicDraft) {
		return topicDraftSourceLabels
	}
	// name the built-in sources a create will add, skipping any the topic draft already names
	const topicDraftSourceKeys = new Set<string>(topicDraft.sources.map((topicSource) => topicSource.sourceOption))
	const missingDefaultSourceLabels = DEFAULT_SOURCES.filter(
		(defaultSource) => !topicDraftSourceKeys.has(defaultSource.key),
	).map((defaultSource) => defaultSource.label)
	return [...missingDefaultSourceLabels, ...topicDraftSourceLabels]
}
