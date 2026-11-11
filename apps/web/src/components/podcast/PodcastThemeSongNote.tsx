import {
	type PodcastThemeSongCreditsElements,
	PodcastThemeSongCredits as SharedPodcastThemeSongCredits,
} from "@carlnotes/core/components/PodcastThemeSongCredits"
import { cn } from "@carlnotes/nightshift/classNames"
import { Headphones } from "lucide-react"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ScrollBox } from "@/components/common/ScrollBox"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import {
	POPOVER_HEADING_CLASS,
	POPOVER_PANEL_CLASS,
	STANDALONE_LINK_CLASS,
	TITLE_ICON_BUTTON_CLASS,
} from "@/lib/styleClasses"

/**
 * The headphones tile right after a film section's or a podcast section's title, whose popup credits the theme song.
 */
export function PodcastThemeSongNote() {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger
						// keep the click from the section's title behind the tile
						onClick={(event) => event.stopPropagation()}
						className={cn(TITLE_ICON_BUTTON_CLASS, "shrink-0 hover:opacity-75")}
						aria-label="Theme song credits"
					>
						<NoteIcon icon={Headphones} />
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
