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
 * Display copy for the default web search source
 */
export const WEB_SOURCE = { label: "web", summary: "let Carl crawl" }

/**
 * Merges class names, resolving Tailwind conflicts.
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs))
}

/**
 * The short age label for an ISO date: today, 3d, 2w, 5mo, or 2y. Empty for a null date.
 */
export function toAgeLabel(dateString: string | null): string {
	// a null date renders as nothing
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

/**
 * A short duration label from milliseconds: 45s, 3 min, or 4.4 min. Empty for a null, non-finite, or negative span.
 */
export function toDurationLabel(ms: number | null): string {
	// a missing, non-finite, or negative span renders as nothing
	if (ms === null || !Number.isFinite(ms) || ms < 0) {
		return ""
	}
	// under a minute reads in whole seconds, floored so a near-minute span never rounds up into the minute format
	if (ms < 60_000) {
		return `${Math.floor(ms / 1000)}s`
	}
	// otherwise minutes to one decimal, dropping a trailing .0 so whole minutes read cleanly
	const minutes = Math.round((ms / 60_000) * 10) / 10
	return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`
}

/**
 * A dollar label from an amount: $0.15, $1.20. Null, NaN, or a missing value all read as $0.00.
 */
export function toDollarLabel(dollars: number | null): string {
	// coerce null or a non-number (seed rows carry no cost) to zero before formatting
	const amount = Number.isFinite(dollars) ? (dollars as number) : 0
	return `$${amount.toFixed(2)}`
}
