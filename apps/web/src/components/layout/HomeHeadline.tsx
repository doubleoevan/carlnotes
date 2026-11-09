import { HERO_HEADLINE_FIRST_SENTENCE, HERO_HEADLINE_LAST_SENTENCE } from "@carlnotes/core/lib/homeHero"
import { cn } from "@carlnotes/nightshift/classNames"
import { AnchorLink } from "@/components/common/AnchorLink"

// the headline's type, which the base heading and its two overlay copies share so their letters line up: the page
// title size of the Updates heading under it. on a phone it scales with the screen so it fits on one row beside
// the New Topic button
const HEADLINE_CLASS = "font-display text-[min(1.125rem,4.4vw)] leading-tight sm:text-2xl"

// the headline's last sentence in the link color. the glint copy keeps only its nowrap
const HEADLINE_ACCENT_CLASS = "text-link faint-underline whitespace-nowrap"

/**
 * The home headline on both faces, the page's h1: a light wipes across the dimmed text once, revealing it in full color.
 * The overlay copies stay letter-aligned with the heading, and "All of it." stays on one line in every copy.
 */
export function HomeHeadline() {
	return (
		<div className="shimmer-reveal min-w-0">
			{/* the dimmed heading that the light reveals. only this copy is a link, and the overlays let clicks through */}
			<h1 className={cn("shimmer-reveal-base", HEADLINE_CLASS)}>
				{`${HERO_HEADLINE_FIRST_SENTENCE} `}
				<AnchorLink href="/topics" className={HEADLINE_ACCENT_CLASS}>
					{HERO_HEADLINE_LAST_SENTENCE}
				</AnchorLink>
			</h1>
			{/* the full-color copy the light wipes in from the left */}
			<div aria-hidden="true" className={cn("shimmer-reveal-top", HEADLINE_CLASS)}>
				{`${HERO_HEADLINE_FIRST_SENTENCE} `}
				<span className={HEADLINE_ACCENT_CLASS}>{HERO_HEADLINE_LAST_SENTENCE}</span>
			</div>
			{/* a white highlight on the reveal edge */}
			<div aria-hidden="true" className={cn("shimmer-reveal-glint", HEADLINE_CLASS)}>
				{`${HERO_HEADLINE_FIRST_SENTENCE} `}
				<span className="whitespace-nowrap">{HERO_HEADLINE_LAST_SENTENCE}</span>
			</div>
		</div>
	)
}
