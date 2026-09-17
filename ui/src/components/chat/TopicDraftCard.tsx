import type { TopicDraft } from "@shared/contracts"
import { DEFAULT_SOURCES } from "@shared/sources"
import { X } from "lucide-react"
import type { ReactNode } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ScrollBox } from "@/components/topic/TopicScanRecap"
import { toScheduleLabel } from "@/lib/labels"
import { POPOVER_HEADING_CLASS } from "@/lib/styleClasses"
import { clearProposedTopicEdit } from "@/stores/chatPanelStore"

// how the card words each visibility
const VISIBILITY_LABELS: Record<TopicDraft["visibility"], string> = {
	public: "Public",
	invite: "Shared by invite",
	private: "Private",
}

/**
 * Shows a topic in the chat above the composer. In the new-topic chat it is Carl's topic draft so far, with the files
 * waiting to become the topic's attachments. While a topic is being edited it is the topic draft.
 * Every setting shows whether or not it is set, so the user sees what is there to change.
 */
export function TopicDraftCard({
	topicDraft,
	topicId,
	isTopicEditProposed = false,
	isCarlReplying = false,
	attachmentFiles = [],
	onRemoveAttachmentFile,
}: {
	topicDraft: TopicDraft
	// the topic the card shows, which makes its name a link. absent in the new-topic chat, where none exists yet
	topicId?: string | null
	// whether the card shows a change carl proposed, not saved to the topic yet
	isTopicEditProposed?: boolean
	// whether carl owes this chat a reply, which is when a rewrite can arrive
	isCarlReplying?: boolean
	attachmentFiles?: File[]
	onRemoveAttachmentFile?: (index: number) => void
}) {
	// a team alone is not a topic draft. opening this chat from a team page starts the draft on that team,
	// and a create clears every other field but keeps the team for the next topic, so counting it would leave the card up for good
	const isTopicDraftEmpty =
		topicDraft.name === "" &&
		topicDraft.prompt === "" &&
		topicDraft.sources.length === 0 &&
		topicDraft.inviteEmails.length === 0 &&
		topicDraft.tags.length === 0
	if (isTopicDraftEmpty && attachmentFiles.length === 0) {
		return null
	}
	// the heading, which is also the card's aria label. an existing topic is a draft the user iterates on, and a
	// new one is a preview of what the create will save
	const heading = topicId ? "Topic draft" : "Topic preview"
	const topicSourceLines = toTopicSourceLines({ topicDraft, isNewTopicDraft: !topicId })
	const tagsLabel = topicDraft.tags.join(", ") || "None"
	const scheduleLabel = toScheduleLabel(topicDraft.frequency, topicDraft.scheduledTime, topicDraft.scheduledDayOfWeek)
	return (
		<section className="shrink-0 border-t px-3 py-2 text-sm" aria-label={heading}>
			<ScrollBox scrollToTopOn={topicDraft} className="max-h-48 overscroll-contain sm:max-h-72">
				{/* the heading centers over the fields, so the dismiss button sits in the corner */}
				<div className="relative">
					<h2 className={POPOVER_HEADING_CLASS}>{heading}</h2>
					{/* clear the proposed edit */}
					{isTopicEditProposed && (
						<button
							type="button"
							aria-label="Dismiss proposed edit"
							onClick={clearProposedTopicEdit}
							className="text-muted-foreground hover:text-foreground absolute top-0 right-0"
						>
							<X className="size-3.5" />
						</button>
					)}
				</div>
				{/* the app's loading in place of the fields while carl replies, and every field fades in after */}
				{isCarlReplying ? (
					<CoffeeLoading className="min-h-24 text-base" />
				) : (
					<>
						{/* the topic name leads the card with no label of its own */}
						{topicDraft.name && (
							<p
								key={topicDraft.name}
								className="text-foreground animate-in fade-in mb-2 break-words duration-500 motion-reduce:animate-none"
							>
								{/* the name opens the topic behind the panel, and reads as plain text before one exists */}
								{topicId ? (
									<AnchorLink href={`/topics/${topicId}`} className="text-link hover:underline">
										{topicDraft.name}
									</AnchorLink>
								) : (
									topicDraft.name
								)}
							</p>
						)}
						{/* the fields in the edit modal's own order, so the two read the same */}
						<dl>
							{topicDraft.prompt && (
								<TopicDraftField label="Carl's Prompt" fieldText={topicDraft.prompt}>
									{topicDraft.prompt}
								</TopicDraftField>
							)}
							<TopicDraftField label="Tags" fieldText={tagsLabel}>
								{tagsLabel}
							</TopicDraftField>
							<TopicDraftField label="Frequency" fieldText={scheduleLabel}>
								{scheduleLabel}
							</TopicDraftField>
							<TopicDraftField label="Max findings" fieldText={String(topicDraft.maxTopicFindings)}>
								{topicDraft.maxTopicFindings} findings per brew
							</TopicDraftField>
							<TopicDraftField label="Visibility" fieldText={topicDraft.visibility}>
								{VISIBILITY_LABELS[topicDraft.visibility]}
							</TopicDraftField>
							{topicDraft.team && (
								<TopicDraftField label="Team" fieldText={topicDraft.team.name}>
									{topicDraft.team.name}
								</TopicDraftField>
							)}
							{topicDraft.inviteEmails.length > 0 && (
								<TopicDraftField label="Invites" fieldText={topicDraft.inviteEmails.join(", ")}>
									<ul className="grid gap-0.5">
										{topicDraft.inviteEmails.map((email, index) => (
											// biome-ignore lint/suspicious/noArrayIndexKey: the list is rebuilt whole from the topic draft
											<li key={`${index}-${email}`}>{email}</li>
										))}
									</ul>
								</TopicDraftField>
							)}
							<TopicDraftField label="Sources" fieldText={topicSourceLines.join(", ")}>
								{/* numbered, so the user can count the topic's sources and name one back to carl */}
								<ol className="list-decimal space-y-0.5 pl-5">
									{topicSourceLines.map((line, index) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: the list is rebuilt whole from the topic draft
										<li key={`${index}-${line}`}>{line}</li>
									))}
								</ol>
							</TopicDraftField>
							{attachmentFiles.length > 0 && (
								<TopicDraftField label="Files">
									<ul className="flex flex-wrap gap-1">
										{attachmentFiles.map((attachmentFile, index) => (
											<li
												key={`${attachmentFile.name}-${attachmentFile.size}-${attachmentFile.lastModified}`}
												className="bg-muted flex items-center gap-1 rounded px-2 py-0.5 text-xs"
											>
												{attachmentFile.name}
												{/* show the remove button only in the new-topic chat */}
												{onRemoveAttachmentFile && (
													<button
														type="button"
														aria-label={`Remove ${attachmentFile.name}`}
														onClick={() => onRemoveAttachmentFile(index)}
														className="hover:text-foreground"
													>
														<X className="size-3" />
													</button>
												)}
											</li>
										))}
									</ul>
								</TopicDraftField>
							)}
						</dl>
					</>
				)}
			</ScrollBox>
		</section>
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
	const topicDraftSources = topicDraft.sources.map(
		(topicSource) =>
			defaultSourceLabels.get(topicSource.sourceOption) ?? `${topicSource.sourceOption} ${topicSource.value}`.trim(),
	)
	if (!isNewTopicDraft) {
		return topicDraftSources
	}
	// name the built-in sources a create will add, skipping any the topic draft already names
	const topicDraftSourceKeys = new Set<string>(topicDraft.sources.map((topicSource) => topicSource.sourceOption))
	const missingDefaultSourceLabels = DEFAULT_SOURCES.filter(
		(defaultSource) => !topicDraftSourceKeys.has(defaultSource.key),
	).map((defaultSource) => defaultSource.label)
	return [...missingDefaultSourceLabels, ...topicDraftSources]
}

// one labeled field of the topic draft
function TopicDraftField({
	label,
	fieldText,
	children,
}: {
	label: string
	// the field's text. a new value remounts the field and fades it in. the files field leaves it off, so its
	// remove button keeps focus
	fieldText?: string
	children: ReactNode
}) {
	return (
		<div className="py-1.5 first:pt-0 last:pb-0">
			<dt className="text-muted-foreground font-display text-xs tracking-wide uppercase">{label}</dt>
			<dd
				key={fieldText}
				className="text-foreground animate-in fade-in mt-1 min-w-0 break-words duration-500 motion-reduce:animate-none"
			>
				{children}
			</dd>
		</div>
	)
}
