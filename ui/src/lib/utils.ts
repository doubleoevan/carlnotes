// shared utils methods and dependencies for the ui
import { type ClassValue, clsx } from "clsx"
import { FileText, Headphones, type LucideIcon, Play } from "lucide-react"
import { twMerge } from "tailwind-merge"
import type { ResourceKind } from "@/providers/TopicFeedProvider"

/**
 * The lucide icon mapped to its resource kind
 */
export const RESOURCE_KIND_ICON: Record<ResourceKind, LucideIcon> = {
	read: FileText,
	watch: Play,
	listen: Headphones,
}

/**
 * Merges class names, resolving Tailwind conflicts.
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs))
}

/**
 * Returns a time label since an ISO date string as a short label
 * today, 3d, 2w, 5mo, 2y
 * empty string for a null date
 */
export function toAgeLabel(dateString: string | null): string {
	if (!dateString) {
		return ""
	}
	// bucket the elapsed days into the coarsest readable unit
	const days = Math.floor((Date.now() - new Date(dateString).getTime()) / 86_400_000)
	if (days < 1) {
		return "today"
	}
	// days, then weeks
	if (days < 7) {
		return `${days}d`
	}
	if (days < 30) {
		return `${Math.floor(days / 7)}w`
	}
	// months, then years
	if (days < 365) {
		return `${Math.floor(days / 30)}mo`
	}
	return `${Math.floor(days / 365)}y`
}
