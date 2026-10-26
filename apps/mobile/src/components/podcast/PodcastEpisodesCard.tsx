import { authClient } from "@carlnotes/client/authClient"
import { fetchSeasonPodcastEpisodes } from "@carlnotes/client/podcastEpisodeClient"
import { PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { usePagination } from "@carlnotes/core/hooks/usePagination"
import { cn } from "@carlnotes/nightshift/classNames"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Pressable, ScrollView, View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Pagination } from "@/components/common/Pagination"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { PodcastEpisodeRow } from "./PodcastEpisodeRow"

/**
 * Lists each season's episodes using the web's five-row pages and shared client.
 */
export function PodcastEpisodesCard({ topic }: { topic: TopicResponse }) {
	// scope older seasons to this account, and keep the delivered latest season live
	const { data: session } = authClient().useSession()
	const [selectedSeason, setSelectedSeason] = useState(0)
	const podcast = topic.podcast
	const seasons = podcast?.seasons ?? []
	const season = seasons.includes(selectedSeason) ? selectedSeason : seasons[0]
	const query = useQuery({
		queryKey: ["mobile-podcast-season", session?.user.id, topic.id, season],
		queryFn: () =>
			season === undefined ? Promise.resolve({ podcastEpisodes: [] }) : fetchSeasonPodcastEpisodes(topic.id, season),
		enabled: season !== undefined && season !== seasons[0],
		gcTime: 0,
	})
	const allEpisodes = (season === seasons[0] ? podcast?.latestSeasonPodcastEpisodes : query.data)?.podcastEpisodes ?? []
	const { pageRows: episodes, pagination } = usePagination(allEpisodes, 5)
	const isLoading = season !== seasons[0] && query.isPending
	if (season === undefined) {
		return null
	}
	return (
		<CollapsibleSection title={`${PODCAST_NAME} episodes`}>
			<View className="rounded-lg border border-separator bg-card px-4 py-2 shadow-raised">
				{/* season tabs remain reachable when a Topic spans several years */}
				<ScrollView horizontal accessibilityLabel="Seasons" showsHorizontalScrollIndicator>
					{seasons.map((item) => (
						<Pressable
							key={item}
							accessibilityRole="tab"
							accessibilityLabel={`Season ${item}`}
							accessibilityState={{ selected: item === season }}
							onPress={() => {
								// start each season at its first episode
								setSelectedSeason(item)
								pagination.setPage(0)
							}}
							className={cn(
								"min-h-12 items-center justify-center border-b-[3px] px-3.5",
								item === season ? "border-primary" : "border-transparent",
							)}
						>
							<Text className={item === season ? "text-sm font-bold" : "text-sm font-semibold text-muted-foreground"}>
								{item}
							</Text>
						</Pressable>
					))}
				</ScrollView>
				{/* retain a full card while an older season loads and provide a retry for thrown failures */}
				{isLoading ? <CoffeeLoading label="Loading your episodes" className="min-h-80" /> : null}
				{season !== seasons[0] && query.isError ? (
					<Button variant="link" accessibilityLabel="Retry episodes" onPress={() => void query.refetch()}>
						<Text>Try again</Text>
					</Button>
				) : null}
				{!isLoading && !query.isError && episodes.length === 0 ? (
					<Text className="py-3 text-sm text-muted-foreground">No episodes yet.</Text>
				) : null}
				{episodes.map((episode, i) => (
					<View
						key={episode.id}
						className={cn("py-2.5", i < episodes.length - 1 && "border-b border-dashed border-separator-strong")}
					>
						<PodcastEpisodeRow episode={episode} isLatestEpisode={episode.id === topic.latestPodcastEpisode?.id} />
					</View>
				))}
			</View>
			<Pagination
				label="Episodes"
				pageNumber={pagination.page + 1}
				pageCount={pagination.pageCount}
				onOpenPage={(page) => pagination.setPage(page - 1)}
			/>
		</CollapsibleSection>
	)
}
