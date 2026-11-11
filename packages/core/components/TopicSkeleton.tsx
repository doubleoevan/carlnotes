import type { ComponentType, ReactNode } from "react"

// both renderers keep the same sections while platform adapters supply their layout and placeholder shapes
export type TopicSkeletonSection =
	| "film"
	| "podcast"
	| "findings"
	| "comments"
	| "topicPosts"
	| "info"
	| "settings"
	| "films"
	| "episodes"
	| "history"
export type TopicSkeletonElements = {
	Root: ComponentType<{ children: ReactNode }>
	Header: ComponentType<{ topicTitle?: string; hasTags: boolean }>
	Body: ComponentType<{ children: ReactNode }>
	Section: ComponentType<{ kind: TopicSkeletonSection; children: ReactNode }>
	Cards: ComponentType<{ children: ReactNode }>
	Column: ComponentType<{ children: ReactNode }>
	Film: ComponentType
	Podcast: ComponentType
	Findings: ComponentType<{ hasChapterPills: boolean }>
	Comments: ComponentType
	TopicPosts: ComponentType
	InfoCard: ComponentType<{ kind: "info" | "settings" }>
	Episodes: ComponentType
	History: ComponentType
	Expander: ComponentType
}

/**
 * Reserves the Topic page's shared header, film, player, Findings, comment thread, Topic Posts, information, and
 * history sections. A Topic with a podcast episode reserves its film and its list of films too.
 */
export function TopicSkeleton({
	topicTitle,
	hasPodcastEpisode = true,
	hasTags = false,
	elements: {
		Root,
		Header,
		Body,
		Section,
		Cards,
		Column,
		Film,
		Podcast,
		Findings,
		Comments,
		TopicPosts,
		InfoCard,
		Episodes,
		History,
		Expander,
	},
}: {
	topicTitle?: string
	hasPodcastEpisode?: boolean
	hasTags?: boolean
	elements: TopicSkeletonElements
}) {
	return (
		<Root>
			<Header topicTitle={topicTitle} hasTags={hasTags} />
			<Body>
				{/* the film's section, then the podcast's, as the page orders them */}
				{hasPodcastEpisode && (
					<>
						<Section kind="film">
							<Film />
						</Section>
						<Section kind="podcast">
							<Podcast />
							<Expander />
						</Section>
					</>
				)}
				<Section kind="findings">
					<Findings hasChapterPills={hasPodcastEpisode} />
					<Expander />
				</Section>
				{/* the comment thread, then the Topic Posts, as the page orders them */}
				<Section kind="comments">
					<Comments />
				</Section>
				<Section kind="topicPosts">
					<TopicPosts />
				</Section>
				<Cards>
					<Column>
						<Section kind="info">
							<InfoCard kind="info" />
						</Section>
						<Section kind="settings">
							<InfoCard kind="settings" />
						</Section>
					</Column>
					<Column>
						{/* the films' list, right above the podcast episodes' */}
						{hasPodcastEpisode && (
							<Section kind="films">
								<Episodes />
							</Section>
						)}
						<Section kind="episodes">
							<Episodes />
						</Section>
						<Section kind="history">
							<History />
						</Section>
					</Column>
				</Cards>
			</Body>
		</Root>
	)
}
