import {
	CARL_PITCH,
	HERO_CALL_TO_ACTION,
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
import { SECTION_LABEL_CLASS } from "@/lib/styleClasses"
import type { toLinkClickHandler } from "@/lib/utils"
import { Attribution } from "./Attribution"

// the tooltip on the hero's two note buttons
const HERO_NOTE_TOOLTIP = "A note from Carl"

/**
 * A visitor's home page hero: Carl on the left and the copy on the right, which fades in. The headline sits under the
 * search bar on the home page itself.
 */
export function HomeHero({ onHomeClick }: { onHomeClick: ReturnType<typeof toLinkClickHandler> | undefined }) {
	return (
		<div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-4 sm:mt-3">
			{/* Carl links home. the image is pulled down so his lower half starts behind the search bar */}
			<AnchorLink href="/" onClick={onHomeClick} aria-label="CarlNotes home" className="shrink-0 sm:ml-4">
				<img
					src="/carl-hero.png"
					width={HERO_IMAGE_SIZE.width}
					height={HERO_IMAGE_SIZE.height}
					alt={HERO_IMAGE_ALT}
					className="w-28 pb-6 -mb-4 sm:w-52"
				/>
			</AnchorLink>
			{/* the copy clears the search bar overlapping the hero's bottom edge */}
			<div className="min-w-0 pb-10">
				{/* Carl's pitch, then the call to action and the tagline.
			    the pitch on a narrow screen is hidden and shows up in a popup */}
				<div className="animate-hydrate text-sm sm:mt-3" style={{ animationDelay: "80ms" }}>
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
