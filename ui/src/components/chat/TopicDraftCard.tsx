import type { TopicDraft } from "@shared/contracts"
import { DEFAULT_SOURCES } from "@shared/sources"
import { X } from "lucide-react"
import type { ReactNode } from "react"
import { ScrollBox } from "@/components/topic/TopicScanRecap"

// how the card words each visibility
const VISIBILITY_LABELS: Record<TopicDraft["visibility"], string> = {
	public: "Public",
	invite: "Shared by invite",
	private: "Private",
}

/**
 * Shows the topic draft in the chat as Carl has written it so far, with the files waiting to become the topic's attachments,
 * above the new-topic chat's composer, hidden while empty and scrolled to the top after each rewrite.
 */
export function TopicDraftCard({
	topicDraft,
	attachmentFiles,
	onRemoveAttachmentFile,
}: {
	topicDraft: TopicDraft
	attachmentFiles: File[]
	onRemoveAttachmentFile: (index: number) => void
}) {
	const isTopicDraftEmpty =
		topicDraft.name === "" &&
		topicDraft.prompt === "" &&
		topicDraft.sources.length === 0 &&
		topicDraft.inviteEmails.length === 0
	if (isTopicDraftEmpty && attachmentFiles.length === 0) {
		return null
	}
	return (
		<section className="shrink-0 border-t px-3 py-2 text-sm" aria-label="Topic draft">
			<ScrollBox scrollToTopOn={topicDraft} className="max-h-48 overscroll-contain sm:max-h-72">
				<p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Topic draft</p>
				<dl className="mt-1 grid gap-1">
					{topicDraft.name && <TopicDraftField label="Title">{topicDraft.name}</TopicDraftField>}
					{topicDraft.prompt && <TopicDraftField label="Prompt">{topicDraft.prompt}</TopicDraftField>}
					<TopicDraftField label="Sources">
						<ul className="grid gap-0.5">
							{toTopicSources(topicDraft).map((line, index) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: the list is rebuilt whole from the draft
								<li key={`${index}-${line}`}>{line}</li>
							))}
						</ul>
					</TopicDraftField>
					<TopicDraftField label="Visibility">{VISIBILITY_LABELS[topicDraft.visibility]}</TopicDraftField>
					{topicDraft.inviteEmails.length > 0 && (
						<TopicDraftField label="Invites">
							<ul className="grid gap-0.5">
								{topicDraft.inviteEmails.map((email, index) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: the list is rebuilt whole from the draft
									<li key={`${index}-${email}`}>{email}</li>
								))}
							</ul>
						</TopicDraftField>
					)}
					{attachmentFiles.length > 0 && (
						<TopicDraftField label="Files">
							<ul className="flex flex-wrap gap-1">
								{attachmentFiles.map((attachmentFile, index) => (
									<li
										key={`${attachmentFile.name}-${attachmentFile.size}-${attachmentFile.lastModified}`}
										className="bg-muted flex items-center gap-1 rounded px-2 py-0.5 text-xs"
									>
										{attachmentFile.name}
										<button
											type="button"
											aria-label={`Remove ${attachmentFile.name}`}
											onClick={() => onRemoveAttachmentFile(index)}
											className="hover:text-foreground"
										>
											<X className="size-3" />
										</button>
									</li>
								))}
							</ul>
						</TopicDraftField>
					)}
				</dl>
			</ScrollBox>
		</section>
	)
}

// the sources the topic will read, the built-in ones first, each once
function toTopicSources(topicDraft: TopicDraft): string[] {
	const defaultTopicSourceKeys = new Set<string>(DEFAULT_SOURCES.map((topicSource) => topicSource.key))
	const topicDraftSources = topicDraft.sources
		.filter((topicSource) => !defaultTopicSourceKeys.has(topicSource.sourceOption))
		.map((topicSource) => `${topicSource.sourceOption} ${topicSource.value}`.trim())
	return [...DEFAULT_SOURCES.map((topicSource) => topicSource.label), ...topicDraftSources]
}

// one labeled field of the draft
function TopicDraftField({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[4.5rem_1fr] gap-2">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd className="min-w-0 break-words">{children}</dd>
		</div>
	)
}
