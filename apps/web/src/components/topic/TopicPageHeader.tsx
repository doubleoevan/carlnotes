import type { TopicResponse } from "@carlnotes/contracts/topics"
import { toTopicDetails } from "@carlnotes/core/lib/detailsLine"
import { isSubscribeShown } from "@carlnotes/core/lib/topicActions"
import { EDIT_IMAGE_DIALOG_TITLES } from "@carlnotes/core/lib/topicImageEditor"
import { cn } from "@carlnotes/nightshift/classNames"
import { PawPrint } from "lucide-react"
import { useState } from "react"
import { DetailsLine } from "@/components/common/DetailsLine"
import { PageUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { Badge } from "@/components/primitives/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { ReactionRow } from "@/components/social/ReactionRow"
import {
	ACTIVE_ICON_CLASS,
	HIGHLIGHTED_PAGE_BUTTON_CLASS,
	PLAIN_PAGE_BUTTON_CLASS,
	TOPIC_HEADER_AREA_CLASSES,
	toTopicHeaderGridClass,
} from "@/lib/styleClasses"
import { toSubscribeTooltip } from "@/lib/utils"
import { setChatPanelState } from "@/stores/chatPanelStore"
import { TopicInfoPopover } from "./Topic"
import { TopicByline } from "./TopicByline"
import { TopicHeaderImage } from "./TopicImageButton"

// the topic, whether the user is signed in, how many findings the findings section lists, the counts that the
// comment thread and the notes section report once they load, and the click on an editor's image
type TopicHeaderProps = {
	topic: TopicResponse
	isSignedIn: boolean
	findingCount: number
	commentCount: number | null
	noteCount: number | null
	onEditImage: () => void
}

/**
 * Renders a topic's header: the image, which an editor clicks to edit, with the title and its chat mention badge, the
 * byline and reactions, the details line of the page's counts under them, and the tags beside it.
 */
export function TopicHeader({
	topic,
	isSignedIn,
	findingCount,
	commentCount,
	noteCount,
	onEditImage,
}: TopicHeaderProps) {
	// both the heading and its note icon open the note and show the hint, so the title holds the state the icon reads
	const [isNoteOpen, setIsNoteOpen] = useState(false)
	const [isNoteHintOpen, setIsNoteHintOpen] = useState(false)
	return (
		<>
			{/* the image at the left with the title, the tags, and the byline and reactions beside it, which on a phone run
			    under it only once they pass its bottom. the heading wraps instead of truncating, and the note icon sits
			    in its own text so a wrapped title keeps the icon beside its last word */}
			<div className={toTopicHeaderGridClass({ hasTags: topic.tags.length > 0, hasActions: false })}>
				<TopicHeaderImage
					image={topic.image}
					name={topic.name}
					editLabel={EDIT_IMAGE_DIALOG_TITLES.topic}
					onEdit={topic.canEdit ? onEditImage : undefined}
				/>
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: the note icon in the heading is the keyboard path */}
				<h1
					onClick={() => setIsNoteOpen(true)}
					onMouseEnter={() => setIsNoteHintOpen(true)}
					onMouseLeave={() => setIsNoteHintOpen(false)}
					className={cn(TOPIC_HEADER_AREA_CLASSES.title, "font-display cursor-pointer text-2xl leading-tight")}
				>
					{/* the chat mention count sits on the name, and its click opens the chat instead of the title's note */}
					<span className="relative">
						{topic.name}
						<PageUpdateCountBadge
							topicId={topic.id}
							onClick={(event) => {
								// the click opens the chat in place, never the link or the title's note
								event.preventDefault()
								event.stopPropagation()
								setChatPanelState("open")
							}}
							onMouseEnter={() => setTimeout(() => setIsNoteHintOpen(false), 0)}
							className="-right-2"
						/>
					</span>
					<TopicInfoPopover
						topic={topic}
						isInline
						isOpen={isNoteOpen}
						onOpenChange={setIsNoteOpen}
						isHintOpen={isNoteHintOpen}
						onHintOpenChange={setIsNoteHintOpen}
					/>
				</h1>
				{/* tags row, left out for an untagged topic */}
				{topic.tags.length > 0 && (
					<div className={cn(TOPIC_HEADER_AREA_CLASSES.tags, "flex flex-wrap gap-1")}>
						{topic.tags.map((tag) => (
							<Badge key={tag} variant="secondary">
								{tag}
							</Badge>
						))}
					</div>
				)}
				{/* the byline and the topic's reactions, under the image on a phone, then the counts of the page's sections on
				    their own line */}
				<div className="mt-1.5 max-sm:clear-left sm:contents">
					<div className={TOPIC_HEADER_AREA_CLASSES.byline}>
						<div className="flex flex-wrap items-center gap-x-3">
							<TopicByline topic={topic} className="text-sm" />
							<ReactionRow target={{ kind: "topic", id: topic.id }} summary={topic.reactions} isSignedIn={isSignedIn} />
						</div>
						<DetailsLine className="mt-1" details={toTopicDetails({ topic, findingCount, commentCount, noteCount })} />
					</div>
				</div>
			</div>
		</>
	)
}

// the Follow button, subscribe in every identifier
export function SubscribeButton({
	topic,
	isSignedIn,
	isHighlighted,
	onToggle,
}: {
	topic: TopicResponse
	isSignedIn: boolean
	// whether this button is the page's one call to action, which decides its fill
	isHighlighted?: boolean
	onToggle: () => void
}) {
	if (!isSubscribeShown(topic)) {
		return null
	}
	const tooltip = toSubscribeTooltip(isSignedIn, topic.isSubscribed, topic.visibility === "invite")
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-pressed={topic.isSubscribed}
					onClick={onToggle}
					className={isHighlighted ? HIGHLIGHTED_PAGE_BUTTON_CLASS : PLAIN_PAGE_BUTTON_CLASS}
				>
					{/* the paw is an outline until subscribed, then fills, matching the homepage topic row */}
					<PawPrint className={cn("size-4", topic.isSubscribed && ACTIVE_ICON_CLASS)} />
					{topic.isSubscribed ? "Unfollow" : "Follow"}
				</button>
			</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	)
}
