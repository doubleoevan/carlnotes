// a podcast episode as a card: its own image, or its topic's until its own is drawn, its title, its topic's name with the season and number, and a play
// control that plays it in place
import type { PodcastEpisodeCard as PodcastEpisodeCardFields } from "@carlnotes/contracts/home"
import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { toPodcastEpisodeDetailsLine } from "@carlnotes/contracts/podcastEpisodes"
import { cardClasses } from "@carlnotes/nightshift/components/card"
import type { ComponentType } from "react"
import type { CardElements } from "./cardElements"

// the platform's elements over the shared card elements: the title, the detail line, and the play control. the title
// takes the episode's path like the card, so the browser stretches the title's link over the card, which keeps the play
// button outside any link
export type PodcastEpisodeCardElements = CardElements & {
	Title: ComponentType<{ path: string; label: string; onOpen?: () => void; children: string }>
	Details: ComponentType<{ children: string }>
	PlayButton: ComponentType<{ podcastEpisode: PodcastEpisodeSummary }>
}

// the podcast episode card's fields and what opening the card reports
export type PodcastEpisodeCardProps = { podcastEpisodeCard: PodcastEpisodeCardFields; onOpen?: () => void }

/**
 * Draws a podcast episode card from the shared fields. The card opens the episode's page, and the play control plays
 * it where the card is.
 */
export function PodcastEpisodeCard({
	podcastEpisodeCard: { podcastEpisode, topic },
	onOpen,
	elements: { Card, Image, Title, Details, PlayButton, Row },
}: PodcastEpisodeCardProps & { elements: PodcastEpisodeCardElements }) {
	// the episode's page, or its topic's page for one with no page path yet
	const path = podcastEpisode.pagePath ?? topic.path
	const label = `Open ${podcastEpisode.title ?? topic.name}`
	return (
		<Card path={path} label={label} className={cardClasses.root} onOpen={onOpen}>
			<Image image={podcastEpisode.image ?? topic.image} name={podcastEpisode.title ?? topic.name} />
			<Row className={cardClasses.body}>
				<Row className="flex-row items-start gap-3">
					<Row className="min-w-0 flex-1 gap-1">
						<Title path={path} label={label} onOpen={onOpen}>
							{podcastEpisode.title ?? topic.name}
						</Title>
						<Details>{toPodcastEpisodeDetailsLine(podcastEpisode, topic.name)}</Details>
					</Row>
					<PlayButton podcastEpisode={podcastEpisode} />
				</Row>
			</Row>
		</Card>
	)
}
