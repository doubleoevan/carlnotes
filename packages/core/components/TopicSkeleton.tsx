import type { ComponentType, ReactNode } from "react"

// both renderers keep the same sections while platform adapters supply their layout and placeholder shapes
export type TopicSkeletonSection = "podcast" | "findings" | "info" | "settings" | "episodes" | "history"
export type TopicSkeletonElements = {
	Root: ComponentType<{ children: ReactNode }>
	Header: ComponentType<{ topicTitle?: string }>
	Body: ComponentType<{ children: ReactNode }>
	Section: ComponentType<{ kind: TopicSkeletonSection; children: ReactNode }>
	Cards: ComponentType<{ children: ReactNode }>
	Column: ComponentType<{ children: ReactNode }>
	Podcast: ComponentType
	Findings: ComponentType
	InfoCard: ComponentType<{ kind: "info" | "settings" }>
	Episodes: ComponentType
	History: ComponentType
	Expander: ComponentType
}

/**
 * Reserves the Topic page's shared header, player, Findings, information, and history sections.
 */
export function TopicSkeleton({
	topicTitle,
	hasPodcastEpisode = true,
	elements: { Root, Header, Body, Section, Cards, Column, Podcast, Findings, InfoCard, Episodes, History, Expander },
}: {
	topicTitle?: string
	hasPodcastEpisode?: boolean
	elements: TopicSkeletonElements
}) {
	return (
		<Root>
			<Header topicTitle={topicTitle} />
			<Body>
				{hasPodcastEpisode && (
					<Section kind="podcast">
						<Podcast />
						<Expander />
					</Section>
				)}
				<Section kind="findings">
					<Findings />
					<Expander />
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
