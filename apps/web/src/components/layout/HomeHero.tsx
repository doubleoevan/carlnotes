import {
	CARL_PITCH,
	HERO_CALL_TO_ACTION,
	HERO_HEADLINE_FIRST_SENTENCE,
	HERO_HEADLINE_LAST_SENTENCE,
	HERO_IMAGE_ALT,
	HERO_IMAGE_SIZE,
	HERO_PITCH_LABEL,
	HERO_TAGLINE,
} from "@carlnotes/core/lib/homeHero"
import { cn } from "@carlnotes/nightshift/classNames"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { TopicTutorialVideoButton } from "@/components/topic/TopicTutorialVideoDialog"
import { SECTION_LABEL_CLASS } from "@/lib/styleClasses"
import type { toLinkClickHandler } from "@/lib/utils"
import { Attribution } from "./Attribution"

// the hero headline's type, which the base heading and its two overlay copies share so their letters line up
const HERO_HEADLINE_CLASS = "font-display text-2xl leading-tight sm:text-4xl"

// the hero headline's last sentence in the accent color. the glint copy keeps only its nowrap
const HERO_HEADLINE_ACCENT_CLASS = "text-hero-accent faint-underline whitespace-nowrap"

// the tooltip on the hero's two note buttons
const HERO_NOTE_TOOLTIP = "A note from Carl"

// the current path, which replays the headline's shimmer, what a home link runs as it follows, and the video's opener
type HomeHeroProps = {
	pathname: string
	onHomeClick: ReturnType<typeof toLinkClickHandler> | undefined
	onPlayTopicTutorialVideo: () => void
}

/**
 * A visitor's home page hero: the headline shimmers and the copy fades in. On a narrow screen, the headline spans
 * both columns above Carl. On a wide screen, Carl takes the left and the headline goes right.
 */
export function HomeHero({ pathname, onHomeClick, onPlayTopicTutorialVideo }: HomeHeroProps) {
	return (
		<div className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-4">
			{/* the headline with the video's button after it, centered on a narrow screen, left-aligned on a wide one.
			    "All of it." stays on one line in every copy, so a narrow screen breaks the headline before it,
			    and the button sits beside that last line */}
			<div className="col-span-2 flex items-end justify-center gap-2 sm:col-span-1 sm:col-start-2 sm:items-center sm:justify-start sm:gap-3">
				{/* the hero headline: a light wipes across the dimmed text, revealing it in full color.
			        keyed to the pathname to replay per route. the overlay copies stay letter-aligned */}
				<div key={pathname} className="shimmer-reveal min-w-0 text-center sm:text-left">
					{/* the dimmed heading that the light reveals. the page's real h1. only this copy is a link.
				        the overlay copies are pointer-transparent */}
					<h1 className={cn("shimmer-reveal-base", HERO_HEADLINE_CLASS)}>
						{`${HERO_HEADLINE_FIRST_SENTENCE} `}
						<AnchorLink href="/" onClick={onHomeClick} className={HERO_HEADLINE_ACCENT_CLASS}>
							{HERO_HEADLINE_LAST_SENTENCE}
						</AnchorLink>
					</h1>
					{/* the full-color copy the light wipes in from the left */}
					<div aria-hidden="true" className={cn("shimmer-reveal-top", HERO_HEADLINE_CLASS)}>
						{`${HERO_HEADLINE_FIRST_SENTENCE} `}
						<span className={HERO_HEADLINE_ACCENT_CLASS}>{HERO_HEADLINE_LAST_SENTENCE}</span>
					</div>
					{/* a white highlight on the reveal edge */}
					<div aria-hidden="true" className={cn("shimmer-reveal-glint", HERO_HEADLINE_CLASS)}>
						{`${HERO_HEADLINE_FIRST_SENTENCE} `}
						<span className="whitespace-nowrap">{HERO_HEADLINE_LAST_SENTENCE}</span>
					</div>
				</div>
				<TopicTutorialVideoButton onSelect={onPlayTopicTutorialVideo} className="size-8 sm:size-11" />
			</div>
			{/* Carl links home. the image is pulled down so his lower half starts behind the search bar */}
			<AnchorLink
				href="/"
				onClick={onHomeClick}
				aria-label="CarlNotes home"
				className="row-start-2 shrink-0 sm:row-span-2 sm:row-start-1 sm:ml-4"
			>
				<img
					src="/carl-hero.png"
					width={HERO_IMAGE_SIZE.width}
					height={HERO_IMAGE_SIZE.height}
					alt={HERO_IMAGE_ALT}
					className="w-28 pb-6 -mb-4 sm:w-52"
				/>
			</AnchorLink>
			{/* the copy clears the search bar overlapping the hero's bottom edge */}
			<div className="col-start-2 row-start-2 min-w-0 pb-10">
				{/* Carl's pitch, then the call to action and the tagline.
			    the pitch on a narrow screen is hidden and shows up in a popup */}
				<div className="animate-hydrate mt-3 text-sm" style={{ animationDelay: "80ms" }}>
					<p className="hidden max-w-xl sm:block">
						{CARL_PITCH}
						<AttributionButton />
					</p>
					<p className="mt-3 font-bold">
						{HERO_CALL_TO_ACTION}
						<PitchButton />
					</p>
					<p className="text-hero-accent mt-1 font-bold">
						<AnchorLink href="/" onClick={onHomeClick} className="hover:underline">
							{HERO_TAGLINE}
						</AnchorLink>
					</p>
				</div>
			</div>
		</div>
	)
}

// the narrow screen note button after the call to action
function PitchButton() {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger
						className="hover:opacity-75 ml-1 inline-grid size-5 translate-y-0.5 place-items-center align-text-bottom sm:hidden"
						aria-label={HERO_PITCH_LABEL}
					>
						{/* the tile fills this inline box exactly */}
						<NoteIcon className="size-5 rounded-sm" />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>{HERO_NOTE_TOOLTIP}</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" className="w-72 text-sm font-normal">
				<PopoverCloseButton />
				{/* the title label. the first line clears the close button */}
				<div className={cn(SECTION_LABEL_CLASS, "mb-2 text-center")}>{HERO_PITCH_LABEL}</div>
				<p>{CARL_PITCH}</p>
			</PopoverContent>
		</Popover>
	)
}

// the note button tucked after the pitch. it opens the persona credit in a popover with a close ✕
function AttributionButton() {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger
						className="hover:opacity-75 ml-1 inline-grid size-5 translate-y-0.5 place-items-center align-text-bottom"
						aria-label="About the CarlNotes persona"
					>
						{/* the tile fills this inline box exactly */}
						<NoteIcon className="size-5 rounded-sm" />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>{HERO_NOTE_TOOLTIP}</TooltipContent>
			</Tooltip>
			<PopoverContent align="start" className="w-80 text-sm">
				<PopoverCloseButton />
				{/* the persona credit's label. the first line clears the close button */}
				<div className={cn(SECTION_LABEL_CLASS, "mb-1 text-center")}>The Real Carl</div>
				<Attribution />
			</PopoverContent>
		</Popover>
	)
}
