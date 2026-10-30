import {
	FREQUENCY_OPTIONS,
	isPlanLimitedFrequency,
	toDailyTopicQuotaDescription,
	toDailyTopicQuotaLabel,
} from "@carlnotes/core/lib/topicSchedule"

export { hasDailySlotLeft } from "@carlnotes/core/lib/topicSchedule"

import { type DayOfWeek, daysOfWeek, type Frequency } from "@carlnotes/contracts/enums"
import { ADMIN_QUOTA } from "@carlnotes/contracts/plans"
import { MAX_TOPIC_SOURCES } from "@carlnotes/contracts/topics"
import { capitalize } from "@carlnotes/core/lib/labels"
import { useNavigate } from "@tanstack/react-router"
import { Coffee, X } from "lucide-react"
import { useId, useState } from "react"
import { FieldLabel } from "@/components/common/FieldLabel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { FULL_SOURCES_NOTE } from "./AddSourceButtons"
import { ScanQuotaLink } from "./ScanQuotaLink"
import { TimePicker } from "./TimePicker"

// the frequency select, the scheduled-time picker, and the day select (weekly only)
export function ScheduleFields({
	frequency,
	onFrequencyChange,
	hasDailySlot,
	dailyTopicsRemaining,
	dailyTopicLimit,
	scheduledTime,
	onScheduledTimeChange,
	scheduledDayOfWeek,
	onScheduledDayOfWeekChange,
}: {
	frequency: Frequency
	onFrequencyChange: (frequency: Frequency) => void
	hasDailySlot: boolean
	dailyTopicsRemaining: number | undefined
	dailyTopicLimit: number | undefined
	scheduledTime: string
	onScheduledTimeChange: (scheduledTime: string) => void
	scheduledDayOfWeek: DayOfWeek
	onScheduledDayOfWeekChange: (dayOfWeek: DayOfWeek) => void
}) {
	// the navigate that opens the plans page on a pick of a plan-limited frequency, the id that ties the label to the
	// select, and whether the frequency list is open
	const navigate = useNavigate()
	const frequencySelectId = useId()
	const [isFrequencyListOpen, setIsFrequencyListOpen] = useState(false)

	// a plan-limited frequency picked from the open list opens the plans page instead of being picked. a typeahead on
	// the closed trigger also reports a plan-limited frequency, and that keeps the current frequency
	const handleFrequencyChange = (value: string): void => {
		const pickedFrequency = value as Frequency
		if (!isPlanLimitedFrequency({ frequency: pickedFrequency, hasDailySlot })) {
			onFrequencyChange(pickedFrequency)
			return
		}
		if (isFrequencyListOpen) {
			void navigate({ to: "/plans" })
		}
	}

	return (
		<div>
			{/* how many daily slots the plan has left, so the user sees their limit before they select a frequency */}
			<div className="flex items-baseline gap-2">
				<FieldLabel htmlFor={frequencySelectId}>Frequency</FieldLabel>
				<DailyTopicQuotaLink dailyTopicsRemaining={dailyTopicsRemaining} dailyTopicLimit={dailyTopicLimit} />
			</div>
			<div className="flex flex-wrap gap-2">
				<Select
					value={frequency}
					onValueChange={handleFrequencyChange}
					open={isFrequencyListOpen}
					onOpenChange={setIsFrequencyListOpen}
				>
					<SelectTrigger id={frequencySelectId} className="w-32">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{FREQUENCY_OPTIONS.map((frequencyOption) => (
							<FrequencyOption key={frequencyOption} frequency={frequencyOption} hasDailySlot={hasDailySlot} />
						))}
					</SelectContent>
				</Select>
				<TimePicker scheduledTime={scheduledTime} onChange={onScheduledTimeChange} />
				{/* the day only matters for a weekly scan, so it's hidden otherwise */}
				{frequency === "weekly" && (
					<Select value={scheduledDayOfWeek} onValueChange={(day) => onScheduledDayOfWeekChange(day as DayOfWeek)}>
						<SelectTrigger className="w-32" aria-label="Scheduled day of week">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{daysOfWeek.map((dayOption) => (
								<SelectItem key={dayOption} value={dayOption}>
									{capitalize(dayOption)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</div>
		</div>
	)
}

// how many Sources a topic may hold
export function SourceLimitNote() {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="text-link mr-2.5 text-xs">{`up to ${MAX_TOPIC_SOURCES}`}</span>
			</TooltipTrigger>
			<TooltipContent>{FULL_SOURCES_NOTE}</TooltipContent>
		</Tooltip>
	)
}

// how many Topics the plan can run on a daily schedule, linked to the plans page
function DailyTopicQuotaLink({
	dailyTopicsRemaining,
	dailyTopicLimit,
}: {
	dailyTopicsRemaining: number | undefined
	dailyTopicLimit: number | undefined
}) {
	const remainingDailyTopics = dailyTopicsRemaining ?? 0
	return (
		<ScanQuotaLink
			isLoading={dailyTopicsRemaining === undefined}
			isUnlimited={remainingDailyTopics >= ADMIN_QUOTA}
			label={toDailyTopicQuotaLabel(dailyTopicsRemaining)}
			href="/plans"
			tooltip={toDailyTopicQuotaDescription(dailyTopicLimit)}
		/>
	)
}

/**
 * Renders one select frequency option. A plan-limited one stays an option, so the listbox holds only options, and the
 * select opens the plans page when it is picked.
 */
export function FrequencyOption({ frequency, hasDailySlot }: { frequency: Frequency; hasDailySlot: boolean }) {
	if (!isPlanLimitedFrequency({ frequency, hasDailySlot })) {
		return <SelectItem value={frequency}>{capitalize(frequency)}</SelectItem>
	}
	return (
		<Tooltip>
			{/* dimmed and marked unavailable, but not disabled, so a hover or focus shows the tooltip and a pick still
			    reaches the select */}
			<TooltipTrigger asChild>
				<SelectItem value={frequency} aria-disabled="true" className="cursor-pointer opacity-50">
					{capitalize(frequency)}
					{/* a coffee cup where the check mark sits, marking a frequency the plan has to buy */}
					<span className="absolute right-2 flex size-3.5 items-center justify-center">
						<Coffee className="size-4" />
					</span>
				</SelectItem>
			</TooltipTrigger>
			{/* beside the list instead of above it, so the tooltip doesn't cover the select option which is the call-to-action */}
			<TooltipContent side="right">Pick up some coffee for more daily scans.</TooltipContent>
		</Tooltip>
	)
}

/**
 * The urls written in the prompt, each saved as a Source unless its ✕ takes it off the list.
 */
export function PromptSourceUrls({ urls, onDismiss }: { urls: string[]; onDismiss: (url: string) => void }) {
	if (urls.length === 0) {
		return null
	}
	return (
		<div className="mt-1.5 flex flex-wrap items-center gap-1.5">
			<span className="text-muted-foreground text-xs">Reading as a source:</span>
			{urls.map((url) => (
				<span
					key={url}
					className="border-separator flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
				>
					<span className="truncate">{url}</span>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								aria-label={`Don't read ${url}`}
								onClick={() => onDismiss(url)}
								className="text-muted-foreground hover:text-foreground shrink-0"
							>
								<X className="size-3" />
							</button>
						</TooltipTrigger>
						<TooltipContent>{`Don't read ${url}`}</TooltipContent>
					</Tooltip>
				</span>
			))}
		</div>
	)
}
