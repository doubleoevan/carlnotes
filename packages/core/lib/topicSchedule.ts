import { type frequencies, isDailyFrequency } from "@carlnotes/contracts/enums"
import { ADMIN_QUOTA } from "@carlnotes/contracts/plans"
import { toBrewsWord } from "./labels"

// order scheduled scans from the least frequent choice
export const FREQUENCY_OPTIONS = [
	"weekly",
	"weekdays",
	"daily",
] as const satisfies readonly (typeof frequencies)[number][]

/**
 * Allows a daily schedule when the plan has room or the Topic already occupies a daily slot.
 */
export function hasDailySlotLeft(
	dailyTopicsRemaining: number | undefined,
	topicFrequency: string | undefined,
): boolean {
	return (dailyTopicsRemaining ?? 1) > 0 || isDailyFrequency(topicFrequency ?? "")
}

/**
 * Identifies a frequency that needs another daily Topic slot.
 */
export function isPlanLimitedFrequency({
	frequency,
	hasDailySlot,
}: {
	frequency: string
	hasDailySlot: boolean
}): boolean {
	return !hasDailySlot && isDailyFrequency(frequency)
}

/**
 * Describes the remaining daily Topic allowance in both schedule forms.
 */
export function toDailyTopicQuotaLabel(remaining: number | undefined): string {
	if (remaining === undefined) {
		return "Loading…"
	}
	if (remaining >= ADMIN_QUOTA) {
		return "Unlimited"
	}
	return `${remaining} daily ${toBrewsWord(remaining)} left`
}

/**
 * Explains the plan's total daily Topic allowance.
 */
export function toDailyTopicQuotaDescription(limit = 0): string {
	return `Your plan gets ${limit} ${limit === 1 ? "pot" : "pots"} daily`
}
