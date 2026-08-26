import { MAX_TOPIC_SOURCES } from "@shared/contracts"
import { daysOfWeek, type frequencies, isDailyFrequency } from "@shared/enums"
import { ADMIN_QUOTA } from "@shared/plans"
import { Coffee, X } from "lucide-react"
import { useNavigate } from "react-router"
import { FieldLabel } from "@/components/common/FieldLabel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { ScanQuotaLink } from "@/components/topic/ScanQuotaLink"
import { TimePicker } from "@/components/topic/TimePicker"
import { capitalize, toBrewsWord } from "@/lib/labels"
import { FULL_SOURCES_NOTE } from "./TopicSourceEditor"

// the field unions that the frequency and day-of-week selects offer
export type Frequency = (typeof frequencies)[number]
export type DayOfWeek = (typeof daysOfWeek)[number]

// the topic scan frequencies in the order the menu offers them, cheapest first
const FREQUENCY_OPTIONS = ["weekly", "weekdays", "daily"] as const satisfies readonly Frequency[]

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
	return (
		<div>
			{/* how many daily slots the plan has left, so the user sees their limit before they select a frequency */}
			<div className="flex items-baseline gap-2">
				<FieldLabel>Frequency</FieldLabel>
				<DailyTopicQuotaLink dailyTopicsRemaining={dailyTopicsRemaining} dailyTopicLimit={dailyTopicLimit} />
			</div>
			<div className="flex flex-wrap gap-2">
				<Select value={frequency} onValueChange={(value) => onFrequencyChange(value as Frequency)}>
					<SelectTrigger className="w-32" aria-label="Scan frequency">
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
	const limit = dailyTopicLimit ?? 0
	return (
		<ScanQuotaLink
			isLoading={dailyTopicsRemaining === undefined}
			isUnlimited={remainingDailyTopics >= ADMIN_QUOTA}
			label={`${remainingDailyTopics} daily ${toBrewsWord(remainingDailyTopics)} left`}
			href="/plans"
			tooltip={`Your plan gets ${limit} ${limit === 1 ? "pot" : "pots"} daily`}
		/>
	)
}

// whether the plan has a daily frequency slot left
export function hasDailySlotLeft(
	dailyTopicsRemaining: number | undefined,
	topicFrequency: string | undefined,
): boolean {
	return (dailyTopicsRemaining ?? 1) > 0 || isDailyFrequency(topicFrequency ?? "")
}

// one select frequency option
function FrequencyOption({ frequency, hasDailySlot }: { frequency: Frequency; hasDailySlot: boolean }) {
	const navigate = useNavigate()
	// only a daily scan draws on a slot, so every other frequency is always open
	if (hasDailySlot || !isDailyFrequency(frequency)) {
		return <SelectItem value={frequency}>{capitalize(frequency)}</SelectItem>
	}
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button type="button" className="w-full cursor-pointer text-left" onClick={() => navigate("/plans")}>
					<SelectItem value={frequency} disabled>
						{capitalize(frequency)}
						{/* a coffee cup where the check mark sits on the option that is disabled,
						    since this must be bought instead of selected */}
						<span className="absolute right-2 flex size-3.5 items-center justify-center">
							<Coffee className="size-4" />
						</span>
					</SelectItem>
				</button>
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
