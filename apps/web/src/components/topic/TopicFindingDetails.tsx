// a topic finding's link preview, Carl's notes, the sender's private annotation, and the stats

import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { useFindingLinkPreview } from "@carlnotes/core/hooks/useFindingLinkPreview"
import { type FindingTopicFields, useFindingTopic } from "@carlnotes/core/hooks/useFindingTopic"
import { toDateLabel } from "@carlnotes/core/lib/labels"
import { togglePodcastEpisodeFindingPlayback } from "@carlnotes/core/stores/podcastEpisodePlayActions"
import { cn } from "@carlnotes/nightshift/classNames"
import { useContext } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink, LinkOpenerContext } from "@/components/common/AnchorLink"
import { LinkPreviewCard } from "@/components/common/LinkPreviewCard"
import { LinkPreviewLoading } from "@/components/common/LinkPreviewLoading"
import { ScrollBox } from "@/components/common/ScrollBox"
import { PodcastEpisodePlayButton } from "@/components/podcast/PodcastEpisodePlayButton"
import { SECTION_LABEL_CLASS, STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { TopicByline } from "./TopicByline"
import { TopicImageLink } from "./TopicImageLink"
import { TopicInfoSection as InfoSection } from "./TopicInfoSection"
import type { TopicResourceInfoTopic } from "./TopicResourceInfo"
import { toNotesMarkdown } from "./TopicScanRecap"

/**
 * A topic finding's link preview, Carl's notes in a scroll box, the sender's private annotation, its topic linked
 * with its image and byline, and its stats.
 * An embedded host's frame reaches no api of its own, so it shows no link preview.
 */
export function TopicFindingDetails({
	resource,
	topic,
	personalAnnotation,
	podcastEpisode,
}: {
	resource: TopicFinding
	topic: TopicResourceInfoTopic
	// the sender's private annotation on this finding, only ever in an MCP view
	personalAnnotation?: string
	// the topic's latest podcast episode, whose play button follows the topic's name
	podcastEpisode?: PodcastEpisode | null
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
			{/* the topic the finding belongs to, over a divider */}
			<FindingTopicSection
				topic={topic}
				podcastEpisode={podcastEpisode ?? null}
				findingId={resource.findingId}
				isReadable={!isInHost}
			/>
			{/* when the resource was fetched and how many times it was opened */}
			<TopicFindingStats fetchedAt={resource.fetchedAt} viewCount={resource.viewCount} />
		</>
	)
}

// the finding's topic over a divider. an embedded host shows the fields the caller passed, and a page reads the byline
// and image if the caller lacks them
function FindingTopicSection({
	isReadable,
	...findingTopicRowProps
}: Omit<FindingTopicRowProps, "findingTopic"> & { isReadable: boolean }) {
	return (
		<InfoSection className="border-b pt-3 pb-3" label="Topic">
			{isReadable ? (
				<ReadFindingTopicRow {...findingTopicRowProps} />
			) : (
				<FindingTopicRow
					{...findingTopicRowProps}
					findingTopic={{
						owner: findingTopicRowProps.topic.owner ?? null,
						teamLink: findingTopicRowProps.topic.teamLink ?? null,
						image: findingTopicRowProps.topic.image ?? null,
					}}
				/>
			)}
		</InfoSection>
	)
}

// the topic's row once its byline and image are known, with the loading line in its place until the read lands
function ReadFindingTopicRow(props: Omit<FindingTopicRowProps, "findingTopic">) {
	const { findingTopic, isLoading } = useFindingTopic({ topicId: props.topic.id, knownFields: props.topic })
	return isLoading ? (
		<CoffeeLoading className="min-h-12 text-sm" />
	) : (
		<FindingTopicRow {...props} findingTopic={findingTopic} />
	)
}

// the topic, the latest podcast episode, the finding whose chapter the play button starts, and the byline and image
type FindingTopicRowProps = {
	topic: TopicResourceInfoTopic
	podcastEpisode: PodcastEpisode | null
	findingId: string
	findingTopic: FindingTopicFields | null
}

// the topic's image spanning two lines, its name linked to its page with the play button that starts the finding's
// chapter, or the whole podcast episode if no chapter narrates it, and its byline under the name
function FindingTopicRow({ topic, podcastEpisode, findingId, findingTopic }: FindingTopicRowProps) {
	return (
		<div className="flex items-center gap-3">
			<TopicImageLink
				image={findingTopic?.image ?? null}
				size="list"
				name={topic.name}
				className="h-12 w-18"
				path={toTopicPath(topic)}
			/>
			<div className="min-w-0 flex-1">
				{/* the name, then the latest podcast episode's play button, as on the topic page */}
				<div className="flex items-center gap-2">
					<AnchorLink
						href={toTopicPath(topic)}
						className={cn(STANDALONE_LINK_CLASS, "min-w-0 text-sm font-semibold break-words")}
					>
						{topic.name}
					</AnchorLink>
					{podcastEpisode && (
						<PodcastEpisodePlayButton
							podcastEpisode={podcastEpisode}
							onPress={() => togglePodcastEpisodeFindingPlayback(podcastEpisode, findingId)}
						/>
					)}
				</div>
				{findingTopic && <TopicByline topic={findingTopic} className="text-xs" />}
			</div>
		</div>
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
