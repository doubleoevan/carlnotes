// the brand icons used across sharing, sign-in, and source rows. lucide dropped its brand icons so these come from simple-icons
import { siBluesky, siGithub, siReddit, siX, siYoutube } from "simple-icons"

// LinkedIn asked simple-icons to drop its icon, so this is the one shape still kept by hand.
// this gets replaced if simple-icons ever includes LinkedIn again
const LINKEDIN_ICON_PATH =
	"M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"

// every icon this app draws, by the name the calling code already uses for that platform
const BRAND_ICON_PATHS = {
	x: siX.path,
	bluesky: siBluesky.path,
	reddit: siReddit.path,
	youtube: siYoutube.path,
	github: siGithub.path,
	linkedin: LINKEDIN_ICON_PATH,
} as const

export type Brand = keyof typeof BRAND_ICON_PATHS

/**
 * One platform's logo, colored by the text around it so it reads as part of the row instead of a sticker.
 */
export function BrandIcon({ brand, className }: { brand: Brand; className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} fill="currentColor" role="presentation">
			<path d={BRAND_ICON_PATHS[brand]} />
		</svg>
	)
}
