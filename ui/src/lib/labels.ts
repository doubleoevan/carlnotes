// values turned into the text a user sees: dates, durations, money, sizes, and counts
import type { daysOfWeek, frequencies } from "@shared/enums"

/**
 * An ISO date as its month and year: Jul 2026. Empty for a null date.
 */
export function toMonthYearLabel(dateString: string | null): string {
	if (!dateString) {
		return ""
	}
	return new Date(dateString).toLocaleDateString(undefined, { month: "short", year: "numeric" })
}

/**
 * The short age label for an ISO date: today, 3d, 2w, 5mo, or 2y. Empty for a null date.
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

/**
 * The milliseconds between a scan's start and finish. Null while it has no finish time yet.
 */
export function durationMsBetween(startedAt: string, finishedAt: string | null): number | null {
	return finishedAt === null ? null : new Date(finishedAt).getTime() - new Date(startedAt).getTime()
}

/**
 * A short duration label from milliseconds: 45s, 3 min, or 4.4 min. Empty for a null, non-finite, or negative span.
 */
export function toDurationLabel(milliseconds: number | null): string {
	// a missing, non-finite, or negative span renders as nothing
	if (milliseconds === null || !Number.isFinite(milliseconds) || milliseconds < 0) {
		return ""
	}
	// under a minute reads in whole seconds, floored so a near-minute span never rounds up into the minute format
	if (milliseconds < 60_000) {
		return `${Math.floor(milliseconds / 1000)}s`
	}
	// otherwise minutes to one decimal, dropping a trailing .0 so whole minutes read cleanly
	const minutes = Math.round((milliseconds / 60_000) * 10) / 10
	return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`
}

/**
 * A dollar label from an amount: $0.15, $1.20. Null, NaN, or a missing value all read as $0.00.
 */
export function toDollarLabel(dollars: number | null): string {
	// coerce null or a non-number (seed rows have no cost) to zero before formatting
	const amount = Number.isFinite(dollars) ? (dollars as number) : 0
	return `$${amount.toFixed(2)}`
}

/**
 * A dollar label from a cents figure: $0.15, $12.00. An em dash for an unavailable (null) value.
 */
export function toCentsLabel(cents: number | null): string {
	return cents === null ? "—" : toDollarLabel(cents / 100)
}

/**
 * A 12-hour label from a "HH:MM" 24-hour time, the hour unpadded the way a clock reads it: "9:00 AM".
 */
export function toTimeLabel(time: string): string {
	const [hours = 0, minutes = 0] = time.split(":").map(Number)
	return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

/**
 * The schedule sentence for a topic's frequency, time, and (for weekly) day: "Daily at 9:00 AM",
 * "Weekly on Monday at 9:00 AM".
 */
export function toScheduleLabel(
	frequency: (typeof frequencies)[number],
	scheduledTime: string,
	scheduledDayOfWeek: (typeof daysOfWeek)[number],
): string {
	const time = toTimeLabel(scheduledTime)
	// only weekly includes a day, capitalized for display
	if (frequency === "weekly") {
		return `Weekly on ${capitalize(scheduledDayOfWeek)} at ${time}`
	}
	return `${capitalize(frequency)} at ${time}`
}

/**
 * A word with its first letter capitalized, for display.
 */
export function capitalize(word: string): string {
	return word.charAt(0).toUpperCase() + word.slice(1)
}

/**
 * A count of Brews with the right plural
 */
export function toBrewsWord(count: number): string {
	return count === 1 ? "Brew" : "Brews"
}

// a count with its noun, singular where there is one of the thing
export function toCountLabel(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`
}

// human-readable bytes for the attributed-storage column and the admin page's storage total
export function toBytesLabel(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`
	}
	// step up through the units until the value fits under 1024
	const units = ["KB", "MB", "GB", "TB"]
	let size = bytes / 1024
	let unitIndex = 0
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024
		unitIndex += 1
	}

	// one decimal reads cleanly at every unit
	return `${size.toFixed(1)} ${units[unitIndex]}`
}
