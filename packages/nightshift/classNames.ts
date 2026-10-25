// the class merge both apps build their classes with
import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"
import { RAISED_SHADOW_UTILITY_NAME } from "./elevation"

// the class merge, taught that the shadow-raised utility is a shadow, so a later shadow-none replaces it
const twMerge = extendTailwindMerge({
	extend: { classGroups: { shadow: [{ shadow: [RAISED_SHADOW_UTILITY_NAME.slice("shadow-".length)] }] } },
})

/**
 * Merges class names, resolving Tailwind conflicts.
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs))
}
