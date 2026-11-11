// a podcast episode as a card: its own image, or its topic's until its own is drawn, its title, its topic's name with
// the season and number, its reaction count at the card's bottom right, and a play control that plays it in place. the
// film card is its video variant, with the film's own image and a play button over that image that opens the film
import type { PodcastEpisodeCard as PodcastEpisodeCardFields } from "@carlnotes/contracts/home"
import type { PodcastEpisodeFormat, PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { toPodcastEpisodeDetailsLine } from "@carlnotes/contracts/podcastEpisodes"
import { toTopicPodcastEpisodeVideoImageUrls } from "@carlnotes/contracts/topicImages"
import type { TopicPodcastEpisodeVideoDialogSurface } from "@carlnotes/contracts/visitAnalytics"
import { cardClasses } from "@carlnotes/nightshift/components/card"
import type { ComponentType } from "react"
import type { CardElements } from "./cardElements"
import type { PodcastEpisodeVideoButtonProps } from "./PodcastEpisodeVideoButton"

// the platform's elements over the shared card elements: the title, the detail line, the play control, and the play
// button that opens a podcast episode's film and reports where it was pressed. the title takes the episode's
// path like the card, so the browser stretches the title's link over the card, which keeps the play button outside any
// link. each app centers the film's play button over the card's image
export type PodcastEpisodeCardElements = CardElements & {
	Title: ComponentType<{ path: string; label: string; onOpen?: () => void; children: string }>
	Details: ComponentType<{ children: string }>
	PlayButton: ComponentType<{ podcastEpisode: PodcastEpisodeSummary }>
	VideoButton: ComponentType<PodcastEpisodeVideoButtonProps>
}

// the podcast episode card's fields and what opening the card reports. the video variant is a film card, and its
// `videoSurface` names the section that its play button reports
export type PodcastEpisodeCardProps = {
	podcastEpisodeCard: PodcastEpisodeCardFields
	onOpen?: () => void
	variant?: PodcastEpisodeFormat
	videoSurface?: TopicPodcastEpisodeVideoDialogSurface
}

/**
 * Draws a podcast episode card from the shared fields. The card opens the episode's page, and the play control plays
 * it where the card is. The video variant is a film card, which shows the film's own image under the play button that
 * opens the film, and has only the title in its title row.
 */
export function PodcastEpisodeCard({
	podcastEpisodeCard: { podcastEpisode, topic, reactionCount },
	onOpen,
	variant = "audio",
	videoSurface = "home-videos",
	elements: { Card, Image, Title, Details, PlayButton, VideoButton, Reactions, Row },
}: PodcastEpisodeCardProps & { elements: PodcastEpisodeCardElements }) {
	// the episode's page, or its topic's page for one with no page path yet
	const path = podcastEpisode.pagePath ?? topic.path
	const label = `Open ${podcastEpisode.title ?? topic.name}`

	// a film card shows the film's own image, and any card the podcast episode's, or its topic's, until that is drawn
	const videoPosterUrl = variant === "video" ? podcastEpisode.videoPosterUrl : null
	const image = videoPosterUrl
		? toTopicPodcastEpisodeVideoImageUrls(videoPosterUrl)
		: (podcastEpisode.image ?? topic.image)
	return (
		<Card path={path} label={label} className={cardClasses.root} onOpen={onOpen}>
			<Image image={image} name={podcastEpisode.title ?? topic.name} />
			<Row className={cardClasses.body}>
				{/* the title, with the audio's play control beside it on a podcast card */}
				<Row className="flex-row items-center gap-3">
					<Row className="min-w-0 flex-1">
						<Title path={path} label={label} onOpen={onOpen}>
							{podcastEpisode.title ?? topic.name}
						</Title>
					</Row>
					{variant === "audio" && <PlayButton podcastEpisode={podcastEpisode} />}
				</Row>
				{/* the detail line across the card, with the reaction count at the card's right, as a topic card has it */}
				<Row className="flex-row items-center gap-2">
					<Row className="min-w-0 flex-1">
						<Details>{toPodcastEpisodeDetailsLine(podcastEpisode, topic.name)}</Details>
					</Row>
					{reactionCount > 0 && <Reactions count={reactionCount} />}
				</Row>
			</Row>
			{/* a film card's play button, which each app centers over the card's image. it follows the title's link */}
			{variant === "video" && <VideoButton podcastEpisode={podcastEpisode} label="Play film" surface={videoSurface} />}
		</Card>
	)
}
