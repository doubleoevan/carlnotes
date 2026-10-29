import {
	PODCAST_THEME_SONG,
	PODCAST_THEME_SONG_DRUMMING_CREDIT,
	PODCAST_THEME_SONG_PERFORMANCE_CREDIT,
	PODCAST_THEME_SONG_PRODUCTION_CREDIT,
	PODCAST_THEME_SONG_WRITING_LABEL,
} from "@carlnotes/contracts/podcastEpisodes"
import type { ComponentType, ReactNode } from "react"
import { PODCAST_THEME_SONG_LYRICS, toLyricsSections } from "../lib/podcastThemeSongLyrics"

type Container = ComponentType<{ children: ReactNode; className?: string }>
export type PodcastThemeSongCreditsElements = {
	Group: Container
	Text: Container
	Heading: Container
	Scroll: Container
	Link: ComponentType<{ children: ReactNode; href: string; className?: string }>
}

/**
 * Composes the theme-song credits, linked authors, complete lyrics, and sign-off in both apps.
 */
export function PodcastThemeSongCredits({
	elements: { Group, Text, Heading, Scroll, Link },
}: {
	elements: PodcastThemeSongCreditsElements
}) {
	const sections = toLyricsSections(PODCAST_THEME_SONG_LYRICS)
	return (
		<Group className="flex flex-col gap-1 text-sm">
			<Heading className="px-6">
				<Link href={PODCAST_THEME_SONG.youtubeUrl} className="sentence-link">
					{PODCAST_THEME_SONG.title}
				</Link>
				{" Theme Song"}
			</Heading>
			<Text>
				{`${PODCAST_THEME_SONG_WRITING_LABEL} `}
				<Link href={PODCAST_THEME_SONG.songwriterUrl} className="sentence-link">
					{PODCAST_THEME_SONG.songwriter}
				</Link>
			</Text>
			<Text>{PODCAST_THEME_SONG_PERFORMANCE_CREDIT}</Text>
			<Text>{PODCAST_THEME_SONG_PRODUCTION_CREDIT}</Text>
			<Text>{PODCAST_THEME_SONG_DRUMMING_CREDIT}</Text>
			{sections.length > 0 && (
				<Scroll className="mt-3">
					{sections.map((section, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: the fixed lyrics never reorder and repeated choruses share a heading
						<Group key={index} className="mb-3 last:mb-0">
							<Text className="font-semibold">{section.heading}</Text>
							<Text className="whitespace-pre-line">{section.lines.join("\n")}</Text>
						</Group>
					))}
				</Scroll>
			)}
			<Text className="mt-1 text-right">
				<Link href={PODCAST_THEME_SONG.youtubeUrl} className="font-bold">
					Enjoy 😊
				</Link>
			</Text>
		</Group>
	)
}
