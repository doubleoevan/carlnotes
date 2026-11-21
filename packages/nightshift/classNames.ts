// the class merge both apps build their classes with
import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"
import { CARD_GLOW_SHADOW_UTILITY_NAME, RAISED_SHADOW_UTILITY_NAME } from "./elevation"

// the class merge, taught that the shadow-raised and shadow-card-glow utilities are shadows, so a later shadow-none
// replaces them
const SHADOW_UTILITY_SUFFIXES = [RAISED_SHADOW_UTILITY_NAME, CARD_GLOW_SHADOW_UTILITY_NAME].map((utilityName) =>
	utilityName.slice("shadow-".length),
)
const twMerge = extendTailwindMerge({ extend: { classGroups: { shadow: [{ shadow: SHADOW_UTILITY_SUFFIXES }] } } })

/**
 * Merges class names, resolving Tailwind conflicts.
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs))
}
