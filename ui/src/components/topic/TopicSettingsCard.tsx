import type { TopicResponse } from "@shared/contracts"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { toAgeLabel, toDollarLabel, toDurationLabel, toScheduleLabel } from "@/lib/labels"
import { INFO_CARD_CLASS } from "@/lib/styleClasses"
import { CollapsibleSection } from "./CollapsibleSection"
import { InfoSection, TopicSourcesSection, TopicVisibility } from "./TopicInfo"

/**
 * The topic page's settings card, with the frequency, max findings, visibility, sources, monthly cost, and podcast.
 */
export function TopicSettingsCard({ topic }: { topic: TopicResponse }) {
	// how long the last scan took, shown under the last scan age
	const lastScanDuration = toDurationLabel(topic.lastScanDurationMs)
	return (
		<CollapsibleSection value="blend" title="Artisanal Blend">
			<div className={INFO_CARD_CLASS}>
				<div className="divide-separator-strong divide-y divide-dashed">
					{/* the frequency, its time and (weekly only) day, the last scan age, and how long that scan took */}
					<InfoSection label="Frequency">
						{toScheduleLabel(topic.frequency, topic.scheduledTime, topic.scheduledDayOfWeek)}
						{topic.isDailyFrequencyPaused && <PausedFrequencyNote />}
						{/* the age is relative to now, so the server's markup can differ */}
						<div className="text-muted-foreground mt-0.5 text-xs" suppressHydrationWarning>
							last scan {topic.lastScanAt ? toAgeLabel(topic.lastScanAt) : "never"}
						</div>
						{lastScanDuration && <div className="text-muted-foreground text-xs">{lastScanDuration} taken</div>}
					</InfoSection>

					{/* the max findings on the left and the visibility on the right, in one row */}
					<div className="flex items-start gap-3 py-3 last:pb-0">
						<InfoSection label="Max findings" className="py-0">{`Carl's top ${topic.maxTopicFindings}`}</InfoSection>
						<InfoSection label="Visibility" className="ml-auto py-0 text-right">
							<TopicVisibility visibility={topic.visibility} />
						</InfoSection>
					</div>

					{/* where Carl looks */}
					<TopicSourcesSection sources={topic.sources} />

					{/* the month's scan cost on the left for the owner or an admin,
					    and whether the podcast is on at the right, in one row */}
					{(topic.monthCostDollars !== null || topic.podcast) && (
						<div className="flex items-start gap-3 py-3 last:pb-0">
							{topic.monthCostDollars !== null && (
								<InfoSection label="Cost this month" className="py-0">
									{toDollarLabel(topic.monthCostDollars)}
								</InfoSection>
							)}
							{topic.podcast && (
								<InfoSection label="Podcast" className="ml-auto py-0 text-right">
									{topic.podcast.isEnabled ? "On" : "Off"}
								</InfoSection>
							)}
						</div>
					)}
				</div>
			</div>
		</CollapsibleSection>
	)
}

// shows that the frequency beside it is paused because the plan is past its limit, with a call to action to upgrade
function PausedFrequencyNote() {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<AnchorLink href="/plans" className="text-link ml-1.5 text-xs hover:underline">
					not brewing
				</AnchorLink>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				Your plan ran out of daily pots. Carl keeps the ones you've had longest.
			</TooltipContent>
		</Tooltip>
	)
}
