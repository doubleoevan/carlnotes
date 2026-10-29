import type { PodcastEpisodeNote } from "@carlnotes/contracts/chatQuestionNotes"
import type { PodcastEpisodeChapterRef } from "@carlnotes/contracts/payloads"
import type { ComponentType, ReactNode } from "react"
import { playPodcastEpisodeChapter } from "../stores/podcastEpisodePlayActions"

// each app supplies its tooltip, button, icon, and truncating text element
export type PodcastEpisodeChapterTagProps = {
	podcastEpisodeChapter: PodcastEpisodeChapterRef
	podcastEpisodeNote: PodcastEpisodeNote
}
export type PodcastEpisodeChapterTagElements = {
	Button: ComponentType<{ children: ReactNode; label: string; onPress: () => void; className: string }>
	Headphones: ComponentType
	Label: ComponentType<{ children: string }>
}

/**
 * Names a question's episode context and starts playback at that chapter when pressed.
 */
export function PodcastEpisodeChapterTag({
	podcastEpisodeChapter,
	podcastEpisodeNote,
	elements: { Button, Headphones, Label },
}: PodcastEpisodeChapterTagProps & { elements: PodcastEpisodeChapterTagElements }) {
	// display stored titles while the authorized playback action reloads the episode
	const chapterNumber = podcastEpisodeChapter.chapterPosition + 1
	const label = `Play ${podcastEpisodeNote.podcastEpisodeTitle} from chapter ${chapterNumber}`
	return (
		<Button
			label={label}
			onPress={() =>
				void playPodcastEpisodeChapter(podcastEpisodeChapter.podcastEpisodeId, podcastEpisodeChapter.chapterPosition)
			}
			className="bg-muted text-muted-foreground hover:text-foreground mt-1 inline-flex min-h-11 max-w-[85%] items-center gap-1.5 rounded-full px-2.5 text-xs sm:min-h-7"
		>
			<Headphones />
			<Label>{`${podcastEpisodeNote.podcastEpisodeTitle} · Ch ${chapterNumber} · ${podcastEpisodeNote.chapterTitle}`}</Label>
		</Button>
	)
}
