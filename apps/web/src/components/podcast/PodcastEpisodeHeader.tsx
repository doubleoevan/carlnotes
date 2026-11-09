// the podcast episode page's header: the episode's own image beside its title and description, which run under the
// image once they pass its bottom, then the topic's byline with the reactions, under the image on a phone
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { EDIT_IMAGE_DIALOG_TITLES } from "@carlnotes/core/lib/topicImageEditor"
import { cn } from "@carlnotes/nightshift/classNames"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ReactionRow } from "@/components/social/ReactionRow"
import { TopicByline } from "@/components/topic/TopicByline"
import { TopicHeaderImage } from "@/components/topic/TopicImageButton"
import { TOPIC_HEADER_AREA_CLASSES, toTopicHeaderGridClass } from "@/lib/styleClasses"
import { PodcastThemeSongNote } from "./PodcastThemeSongNote"

// the podcast episode page, whether the reader is signed in, for the reactions, and the click on an editor's image
type PodcastEpisodeHeaderProps = {
	podcastEpisodePage: PodcastEpisodePageResponse
	isSignedIn: boolean
	onEditImage: () => void
}

/**
 * Renders the podcast episode's own image beside its title and description, then the topic's byline with the reactions.
 */
export function PodcastEpisodeHeader({ podcastEpisodePage, isSignedIn, onEditImage }: PodcastEpisodeHeaderProps) {
	const { podcastEpisode, topic } = podcastEpisodePage
	const topicPath = toTopicPath(topic)
	return (
		<header className={HEADER_GRID_CLASS}>
			<TopicHeaderImage
				image={podcastEpisode.image}
				name={podcastEpisode.title ?? topic.name}
				editLabel={EDIT_IMAGE_DIALOG_TITLES.podcastEpisode}
				onEdit={podcastEpisodePage.canEditPodcastEpisode ? onEditImage : undefined}
			/>
			<h1
				className={cn(TOPIC_HEADER_AREA_CLASSES.title, "font-display text-2xl leading-tight text-balance sm:text-3xl")}
			>
				{podcastEpisode.title}
				<PodcastThemeSongNote />
			</h1>
			<div className={TOPIC_HEADER_AREA_CLASSES.byline}>
				{podcastEpisode.description && <p className="mt-1.5 text-sm sm:mt-0">{podcastEpisode.description}</p>}
				{/* the byline, the topic's name, and the reactions on one line */}
				<div className="mt-1.5 flex flex-wrap items-center gap-x-3 max-sm:clear-left">
					<span className="text-muted-foreground inline-flex flex-wrap items-center gap-x-1 text-sm">
						<TopicByline topic={topic} label="Recorded by" className="text-sm" />
						<span>
							{topic.teamLink || topic.owner ? "for " : "Coffee Break podcast for "}
							<AnchorLink href={topicPath} className="sentence-link">
								{topic.name}
							</AnchorLink>
						</span>
					</span>
					<ReactionRow
						target={{ kind: "podcastEpisode", id: podcastEpisode.id }}
						summary={podcastEpisodePage.reactions}
						isSignedIn={isSignedIn}
					/>
				</div>
			</div>
		</header>
	)
}

// the header's grid from sm up, the topic header's with no tags and no actions, and its float on a phone
const HEADER_GRID_CLASS = toTopicHeaderGridClass({ hasTags: false, hasActions: false })
