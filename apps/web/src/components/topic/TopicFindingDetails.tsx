// a topic finding's link preview, Carl's notes, the sender's private annotation, and the stats

import type { TopicFinding } from "@carlnotes/contracts/findings"
import { useFindingLinkPreview } from "@carlnotes/core/hooks/useFindingLinkPreview"
import { toDateLabel } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import { useContext } from "react"
import { LinkOpenerContext } from "@/components/common/AnchorLink"
import { LinkPreviewCard } from "@/components/common/LinkPreviewCard"
import { LinkPreviewLoading } from "@/components/common/LinkPreviewLoading"
import { ScrollBox } from "@/components/common/ScrollBox"
import { SECTION_LABEL_CLASS } from "@/lib/styleClasses"
import { TopicInfoSection as InfoSection } from "./TopicInfoSection"
import type { TopicResourceInfoTopic } from "./TopicResourceInfo"
import { toNotesMarkdown } from "./TopicScanRecap"

/**
 * A topic finding's link preview, Carl's notes in a scroll box, the sender's private annotation, and its stats.
 * An embedded host's frame reaches no api of its own, so it shows no link preview.
 */
export function TopicFindingDetails({
	resource,
	topic,
	personalAnnotation,
}: {
	resource: TopicFinding
	topic: TopicResourceInfoTopic
	// the sender's private annotation on this finding, only ever in an MCP view
	personalAnnotation?: string
}) {
	const isInHost = useContext(LinkOpenerContext) !== null
	return (
		<>
			{/* the linked page's link preview card, right above Carl's notes */}
			{!isInHost && <FindingLinkPreview key={resource.findingId} findingId={resource.findingId} />}

			{/* the AI explanation of why this resource is relevant, in a scroll box so a long note stays contained */}
			<div className={cn(SECTION_LABEL_CLASS, "mb-1")}>{"Carl's notes"}</div>
			<ScrollBox
				copyMarkdown={toNotesMarkdown({
					topicId: topic.id,
					topicName: topic.name,
					prompt: topic.prompt,
					note: `[${resource.title ?? resource.url}](${resource.url})\n\n${resource.relevanceExplanation}`,
				})}
			>
				<p>{resource.relevanceExplanation || "No notes yet."}</p>
			</ScrollBox>
			{/* the sender's private annotation, which no other caller's result holds */}
			{personalAnnotation && (
				<>
					<div className={cn(SECTION_LABEL_CLASS, "mt-3 mb-1")}>Your private note</div>
					<p className="text-sm">{personalAnnotation}</p>
				</>
			)}
			{/* when the resource was fetched and how many times it was opened */}
			<TopicFindingStats fetchedAt={resource.fetchedAt} viewCount={resource.viewCount} />
		</>
	)
}

/**
 * A topic finding's fetch day on the left and how many times it was opened on the right, in one row.
 */
export function TopicFindingStats({ fetchedAt, viewCount }: { fetchedAt: string; viewCount: number }) {
	return (
		<div className="mt-3 flex justify-between gap-4">
			<InfoSection className="py-0" label="Fetched">
				{toDateLabel(fetchedAt)}
			</InfoSection>
			<InfoSection className="py-0 text-right" label="Views">
				{viewCount.toLocaleString()}
			</InfoSection>
		</div>
	)
}

// the linked page's link preview card, fetched when the note popover opens
function FindingLinkPreview({ findingId }: { findingId: string }) {
	const { linkPreview, isLoading } = useFindingLinkPreview(findingId)

	// the loading card until the fetch settles, then the card if the page offers one
	if (isLoading) {
		return <LinkPreviewLoading />
	}
	if (!linkPreview) {
		return null
	}
	return (
		<div className="mb-3">
			<LinkPreviewCard linkPreview={linkPreview} className="max-w-full" isUserContent />
		</div>
	)
}
