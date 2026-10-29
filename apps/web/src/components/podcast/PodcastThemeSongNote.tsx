import {
	type PodcastThemeSongCreditsElements,
	PodcastThemeSongCredits as SharedPodcastThemeSongCredits,
} from "@carlnotes/core/components/PodcastThemeSongCredits"
import { cn } from "@carlnotes/nightshift/classNames"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ScrollBox } from "@/components/common/ScrollBox"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import {
	ICON_TILE_BUTTON_CLASS,
	POPOVER_HEADING_CLASS,
	POPOVER_PANEL_CLASS,
	STANDALONE_LINK_CLASS,
} from "@/lib/styleClasses"

/**
 * The note icon beside the podcast's name or a podcast episode's title, whose popup credits the theme song.
 */
export function PodcastThemeSongNote({ className }: { className?: string }) {
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
				<PodcastThemeSongCredits />
			</PopoverContent>
		</Popover>
	)
}

const elements: PodcastThemeSongCreditsElements = {
	Group: ({ children, className }) => <div className={className}>{children}</div>,
	Text: ({ children, className }) => <p className={className}>{children}</p>,
	Heading: ({ children, className }) => <h2 className={cn(POPOVER_HEADING_CLASS, className)}>{children}</h2>,
	Scroll: ({ children, className }) => <ScrollBox boxClassName={className}>{children}</ScrollBox>,
	Link: ({ className, ...props }) => <AnchorLink {...props} className={cn(STANDALONE_LINK_CLASS, className)} />,
}

// render the portable credits inside the browser popup
function PodcastThemeSongCredits() {
	return <SharedPodcastThemeSongCredits elements={elements} />
}
