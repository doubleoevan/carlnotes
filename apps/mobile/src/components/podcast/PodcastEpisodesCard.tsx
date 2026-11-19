import { authClient } from "@carlnotes/client/authClient"
import { fetchSeasonPodcastEpisodes } from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	PODCAST_EPISODE_SEASON_KEY,
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
	// the title is long, so a phone has no room for its count, as on the web's narrow screen
	Section: ({ title, children }) => (
		<CollapsibleSection title={title} hasClosedDivider>
			{children}
		</CollapsibleSection>
	),
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
 * Adapts shared season cards to account-scoped queries and app routing as Coffee Break podcast episodes, with removal
 * for a permitted user.
 */
export function PodcastEpisodesCard({ topic }: { topic: TopicResponse }) {
	// the season shown, its podcast episodes, and the loaded or linked podcast episode
	const params = useLocalSearchParams<{ episode?: string }>()
	const queryClient = useQueryClient()
	const { podcastEpisode } = usePodcastEpisodePlayer()
	const season = useSeasonPodcastEpisodes(topic)
	return (
		<SharedPodcastEpisodesCard
			topic={topic}
			shownSeason={season.shownSeason}
			episodes={season.podcastEpisodes}
			isLoading={season.isLoading}
			isError={season.isError}
			search=""
			selectedEpisodeId={toShownPodcastEpisodeId({
				topic,
				loadedPodcastEpisode: podcastEpisode,
				linkedPodcastEpisodeId: params.episode,
			})}
			onOpenSeason={season.openSeason}
			onReload={season.reload}
			onRemoved={async () => {
				// refresh both existing Topic payloads before reloading the selected season
				await queryClient.invalidateQueries({ queryKey: ["topic-page"] })
				await queryClient.invalidateQueries({ queryKey: ["topic-feed"] })
			}}
			elements={elements}
		/>
	)
}

// the season shown, its podcast episodes, the load state, and the calls that open a season and load it again. the
// latest season's podcast episodes arrive with the topic, and an older season is fetched for this account
function useSeasonPodcastEpisodes(topic: TopicResponse): {
	shownSeason: number | undefined
	podcastEpisodes: PodcastEpisode[]
	isLoading: boolean
	isError: boolean
	openSeason: (season: number) => void
	reload: () => Promise<void>
} {
	// the season the route names, and whether it is an older one
	const { data: session } = authClient().useSession()
	const params = useLocalSearchParams<{ [PODCAST_EPISODE_SEASON_KEY]?: string }>()
	const seasons = topic.podcast?.seasons ?? []
	const shownSeason = toShownPodcastSeason(seasons, params[PODCAST_EPISODE_SEASON_KEY])
	const isOlderSeason = shownSeason !== seasons[0]

	// fetch an older season for this account, and drop it once the screen leaves it
	const query = useQuery({
		queryKey: ["mobile-podcast-season", session?.user.id, topic.id, shownSeason],
		queryFn: ({ signal }) =>
			fetchSeasonPodcastEpisodes({
				topicId: topic.id,
				season: shownSeason ?? 0,
				signal,
				shouldThrowOnError: true,
			}),
		enabled: shownSeason !== undefined && isOlderSeason,
		gcTime: 0,
	})

	// the latest season's podcast episodes from the topic
	const latestSeasonPodcastEpisodes = topic.podcast?.latestSeasonPodcastEpisodes?.podcastEpisodes ?? []
	return {
		shownSeason,
		podcastEpisodes: isOlderSeason ? (query.data?.podcastEpisodes ?? []) : latestSeasonPodcastEpisodes,
		isLoading: isOlderSeason && query.isPending,
		isError: isOlderSeason && query.isError,
		openSeason: (season) =>
			router.setParams({ [PODCAST_EPISODE_SEASON_KEY]: season === seasons[0] ? undefined : String(season) }),
		reload: async () => {
			if (isOlderSeason) {
				await query.refetch()
			}
		},
	}
}
