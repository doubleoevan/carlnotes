import { authClient } from "@carlnotes/client/authClient"
import { fetchSeasonPodcastEpisodes } from "@carlnotes/client/podcastEpisodeClient"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	type PodcastEpisodesCardElements,
	PodcastEpisodesCard as SharedPodcastEpisodesCard,
	toShownPodcastEpisodeId,
	toShownPodcastSeason,
} from "@carlnotes/core/components/PodcastEpisodesCard"
import { usePodcastEpisodePlayer } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { router, useLocalSearchParams } from "expo-router"
import { Pressable, ScrollView, View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Pagination } from "@/components/common/Pagination"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { PodcastEpisodeRow } from "./PodcastEpisodeRow"
import { RemovePodcastEpisodeDialog } from "./RemovePodcastEpisodeDialog"

// adapt scrolling tabs and accessible list controls without duplicating episode visibility or actions
const elements: PodcastEpisodesCardElements = {
	Section: CollapsibleSection,
	Card: ({ children }) => (
		<View className="rounded-lg border border-separator bg-card p-1 shadow-raised">{children}</View>
	),
	Tabs: ({ children }) => (
		<ScrollView
			horizontal
			accessibilityLabel="Seasons"
			showsHorizontalScrollIndicator
			contentContainerClassName="gap-1 px-2"
		>
			{children}
		</ScrollView>
	),
	Tab: ({ season, className, onPress, isSelected }) => (
		<Pressable
			accessibilityRole="tab"
			accessibilityLabel={`Season ${season}`}
			accessibilityState={{ selected: isSelected }}
			onPress={onPress}
			hitSlop={toTouchTargetHitSlop(44)}
			className={`${className} justify-center`}
		>
			<Text className={isSelected ? "text-sm font-bold" : "text-sm font-semibold text-muted-foreground"}>{season}</Text>
		</Pressable>
	),
	Loading: () => <CoffeeLoading label="Loading your episodes" className="min-h-80 text-base sm:min-h-70" />,
	List: ({ children, label, isLoading }) => (isLoading ? null : <View accessibilityLabel={label}>{children}</View>),
	Row: PodcastEpisodeRow,
	Pagination,
	Remove: RemovePodcastEpisodeDialog,
	Failure: ({ onRetry }) => (
		<Button variant="link" accessibilityLabel="Retry episodes" onPress={onRetry}>
			<Text>Try again</Text>
		</Button>
	),
	Empty: () => <Text className="py-3 text-sm text-muted-foreground">No episodes yet.</Text>,
}

/**
 * Adapts shared season cards to account-scoped queries and app routing.
 */
export function PodcastEpisodesCard({ topic }: { topic: TopicResponse }) {
	// scope fetched seasons to the current account and retire requests when the route changes
	const { data: session } = authClient().useSession()
	const params = useLocalSearchParams<{ season?: string; episode?: string }>()
	const queryClient = useQueryClient()
	const { podcastEpisode } = usePodcastEpisodePlayer()
	const seasons = topic.podcast?.seasons ?? []
	const shownSeason = toShownPodcastSeason(seasons, params.season)
	const isOlderSeason = shownSeason !== seasons[0]
	const query = useQuery({
		queryKey: ["mobile-podcast-season", session?.user.id, topic.id, shownSeason],
		queryFn: ({ signal }) =>
			fetchSeasonPodcastEpisodes({ topicId: topic.id, season: shownSeason ?? 0, signal, shouldThrowOnError: true }),
		enabled: shownSeason !== undefined && isOlderSeason,
		gcTime: 0,
	})
	const episodes = (isOlderSeason ? query.data : topic.podcast?.latestSeasonPodcastEpisodes)?.podcastEpisodes ?? []
	return (
		<SharedPodcastEpisodesCard
			topic={topic}
			shownSeason={shownSeason}
			episodes={episodes}
			isLoading={isOlderSeason && query.isPending}
			isError={isOlderSeason && query.isError}
			search=""
			selectedEpisodeId={toShownPodcastEpisodeId({
				topic,
				loadedPodcastEpisode: podcastEpisode,
				linkedPodcastEpisodeId: params.episode,
			})}
			onOpenSeason={(season) => router.setParams({ season: season === seasons[0] ? undefined : String(season) })}
			onReload={async () => {
				if (isOlderSeason) {
					await query.refetch()
				}
			}}
			onRemoved={async () => {
				// refresh both existing Topic payloads before reloading the selected season
				await queryClient.invalidateQueries({ queryKey: ["topic-page"] })
				await queryClient.invalidateQueries({ queryKey: ["topic-feed"] })
			}}
			elements={elements}
		/>
	)
}
