import type { PodcastEpisode, PodcastEpisodeChapter, PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { Headphones, Play } from "lucide-react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

/**
 * Shows the web's chapter pill on the finding it narrates.
 */
export function FindingChapterPill({
	podcastEpisode,
	findingId,
}: {
	podcastEpisode?: PodcastEpisode | null
	findingId: string
}) {
	const chapter = podcastEpisode?.chapters.find((chapter) => chapter.findingId === findingId)
	if (!podcastEpisode || !chapter) {
		return null
	}
	return <PodcastEpisodeChapterPill podcastEpisode={podcastEpisode} chapter={chapter} />
}

/**
 * Shares the web's chapter pill between Finding rows and the podcast's chapter list.
 */
export function PodcastEpisodeChapterPill({
	podcastEpisode,
	chapter,
}: {
	podcastEpisode: PodcastEpisode
	chapter: PodcastEpisodeChapter
}) {
	return <PodcastEpisodePill podcastEpisode={podcastEpisode} chapterNumber={chapter.position + 1} />
}

/**
 * Shows an episode's numbered pill with the existing web player as its destination.
 */
export function PodcastEpisodeNumberPill({ podcastEpisode }: { podcastEpisode: PodcastEpisodeSummary | null }) {
	return podcastEpisode ? <PodcastEpisodePill podcastEpisode={podcastEpisode} /> : null
}

// keep the same pill body and native touch target for episodes and chapters
function PodcastEpisodePill({
	podcastEpisode,
	chapterNumber,
}: {
	podcastEpisode: PodcastEpisodeSummary
	chapterNumber?: number
}) {
	if (!podcastEpisode.pagePath || podcastEpisode.episodeNumber === null) {
		return null
	}
	// name the chapter while the accessible hint identifies the web player handoff
	const text = `E${podcastEpisode.episodeNumber}${chapterNumber ? ` · ch ${chapterNumber}` : ""}`
	return (
		<AnchorLink
			href={`${SITE_URL}${podcastEpisode.pagePath}`}
			accessibilityLabel={`Open player for episode ${podcastEpisode.episodeNumber}${chapterNumber ? `, chapter ${chapterNumber}` : ""}`}
			accessibilityHint="Opens the player on carlnotes.com"
			onPress={(event) => event.stopPropagation()}
			hitSlop={toTouchTargetHitSlop(24)}
			className="shrink-0 flex-row items-center gap-1 rounded-full border border-separator-strong bg-muted px-2 py-0.5 shadow-raised active:opacity-75"
		>
			<Icon as={Headphones} className="size-3 text-link" strokeWidth={2.5} />
			<Text className="text-xs font-semibold text-link">{text}</Text>
			<Icon as={Play} className="size-2.5 text-link" fill="currentColor" strokeWidth={2.5} />
		</AnchorLink>
	)
}
