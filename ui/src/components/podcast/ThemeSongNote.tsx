import {
	PODCAST_THEME_SONG,
	PODCAST_THEME_SONG_DRUMMING_CREDIT,
	PODCAST_THEME_SONG_PERFORMANCE_CREDIT,
	PODCAST_THEME_SONG_PRODUCTION_CREDIT,
	PODCAST_THEME_SONG_WRITING_LABEL,
} from "@shared/podcastEpisodes"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { ScrollBox } from "@/components/topic/TopicScanRecap"
import { ICON_TILE_BUTTON_CLASS, POPOVER_HEADING_CLASS, POPOVER_PANEL_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { THEME_SONG_LYRICS, toLyricsSections } from "./themeSongLyrics"

/**
 * The note icon beside the podcast's name or a podcast episode's title, whose popup credits the theme song.
 */
export function ThemeSongNote({ className }: { className?: string }) {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger
						// keep the click from the card or the heading behind the note
						onClick={(event) => event.stopPropagation()}
						className={cn(ICON_TILE_BUTTON_CLASS, "ml-2 hover:opacity-75", className)}
						aria-label="Theme song credits"
					>
						<NoteIcon />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="top">Theme song credits</TooltipContent>
			</Tooltip>
			<PopoverContent onClick={(event) => event.stopPropagation()} align="start" className={POPOVER_PANEL_CLASS}>
				<PopoverCloseButton />
				<ThemeSongCredits />
			</PopoverContent>
		</Popover>
	)
}

// the heading with the theme song's title linked to its video, the credits, the lyrics by section, and a link to the video
function ThemeSongCredits() {
	const lyricsSections = toLyricsSections(THEME_SONG_LYRICS)
	return (
		<div className="flex flex-col gap-1 text-sm">
			{/* the heading in the note popups' heading style, padded on both sides so that the heading centers clear of the close button */}
			<h2 className={cn(POPOVER_HEADING_CLASS, "px-6")}>
				<AnchorLink href={PODCAST_THEME_SONG.youtubeUrl} className="text-link hover:underline">
					{PODCAST_THEME_SONG.title}
				</AnchorLink>
				{" Theme Song"}
			</h2>
			<p>
				{`${PODCAST_THEME_SONG_WRITING_LABEL} `}
				<AnchorLink href={PODCAST_THEME_SONG.songwriterUrl} className="text-link hover:underline">
					{PODCAST_THEME_SONG.songwriter}
				</AnchorLink>
			</p>
			<p>{PODCAST_THEME_SONG_PERFORMANCE_CREDIT}</p>
			<p>{PODCAST_THEME_SONG_PRODUCTION_CREDIT}</p>
			<p>{PODCAST_THEME_SONG_DRUMMING_CREDIT}</p>

			{/* the lyrics in the standard scroll box, each section's heading over its lines */}
			{lyricsSections.length > 0 && (
				<ScrollBox boxClassName="mt-3">
					{lyricsSections.map((lyricsSection, lyricsSectionIndex) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: the lyrics' sections never reorder, and a heading such as Chorus repeats
						<div key={lyricsSectionIndex} className="mb-3 last:mb-0">
							<p className="font-semibold">{lyricsSection.heading}</p>
							<p className="whitespace-pre-line">{lyricsSection.lines.join("\n")}</p>
						</div>
					))}
				</ScrollBox>
			)}

			{/* the link to the song's video, at the far right below the lyrics */}
			<p className="mt-1 text-right">
				<AnchorLink href={PODCAST_THEME_SONG.youtubeUrl} className="text-link font-bold hover:underline">
					Enjoy 😊
				</AnchorLink>
			</p>
		</div>
	)
}
