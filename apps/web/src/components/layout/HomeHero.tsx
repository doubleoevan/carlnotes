import {
	CARL_PITCH,
	HERO_CALL_TO_ACTION,
	HERO_IMAGE_ALT,
	HERO_IMAGE_SIZE,
	HERO_PITCH_LABEL,
	HERO_TAGLINE,
} from "@carlnotes/core/lib/homeHero"
import { cn } from "@carlnotes/nightshift/classNames"
import { useLocation } from "@tanstack/react-router"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { toSignupHref } from "@/components/session/signupPrompts"
import { SECTION_LABEL_CLASS } from "@/lib/styleClasses"
import type { toLinkClickHandler } from "@/lib/utils"

// the tooltip on the narrow-screen note button
const HERO_NOTE_TOOLTIP = "A note from Carl"

/**
 * A visitor's home page hero: Carl on the left and the copy on the right, which fades in. The headline sits under the
 * search bar on the home page itself.
 */
export function HomeHero({ onHomeClick }: { onHomeClick: ReturnType<typeof toLinkClickHandler> | undefined }) {
	const returnPath = useLocation({ select: (location) => location.pathname + location.searchStr })
	return (
		<div className="grid grid-cols-[min(47%,11.5rem)_minmax(0,1fr)] gap-x-3 pt-1 pb-6 md:gap-x-4 min-[460px]:grid-cols-[8rem_minmax(0,1fr)] min-[704px]:grid-cols-[6.25rem_minmax(0,1fr)] md:grid-cols-[20rem_minmax(0,1fr)] md:pt-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
			{/* align the illustration with the search bar's icon and let it extend behind the bar */}
			<AnchorLink
				href="/"
				onClick={onHomeClick}
				aria-label="CarlNotes home"
				className="relative -mb-2 ml-[calc(0.75rem+1px)] md:-mb-4"
			>
				<img
					src="/carl-hero.png"
					width={HERO_IMAGE_SIZE.width}
					height={HERO_IMAGE_SIZE.height}
					alt={HERO_IMAGE_ALT}
					className="absolute inset-0 h-full w-full rounded-lg object-cover object-[34%_center]"
				/>
			</AnchorLink>
			{/* the pitch moves into the note button when it needs more room */}
			<div
				className="animate-hydrate min-w-0 py-3 md:py-4 text-sm leading-snug wrap-break-word md:text-base md:leading-normal"
				style={{ animationDelay: "80ms" }}
			>
				<p className="hidden max-w-prose text-pretty md:block">{CARL_PITCH}</p>
				<p className="max-w-prose font-normal leading-tight md:mt-2">
					{HERO_CALL_TO_ACTION.opening}{" "}
					<AnchorLink href={toSignupHref("new-topic", returnPath)} className="font-bold underline underline-offset-2">
						{HERO_CALL_TO_ACTION.linkText}
					</AnchorLink>{" "}
					{HERO_CALL_TO_ACTION.closing}
					<PitchButton />
				</p>
				<p className="text-hero-accent mt-1 font-bold leading-tight">
					<AnchorLink href="/" onClick={onHomeClick} className="hover:underline">
						{HERO_TAGLINE}
					</AnchorLink>
				</p>
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
						className="hover:opacity-75 ml-1 inline-grid size-5 translate-y-0.5 place-items-center align-text-bottom md:hidden"
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
