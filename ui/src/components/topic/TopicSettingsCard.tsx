import type { TopicResponse } from "@shared/contracts"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { INFO_CARD_CLASS, toAgeLabel, toDollarLabel, toDurationLabel, toScheduleLabel } from "@/lib/utils"
import { CollapsibleSection } from "./CollapsibleSection"
import { InfoSection, TopicSourcesSection } from "./TopicInfo"

/**
 * The topic page's card for how the topic is brewed: where Carl looks, when he looks, and how much he keeps.
 * Who may see it reads as part of the topic itself, so visibility sits in the Topic roast card instead.
 */
export function TopicSettingsCard({ topic }: { topic: TopicResponse }) {
	// how long the last scan took, shown under the last scan age
	const lastScanDuration = toDurationLabel(topic.lastScanDurationMs)
	return (
		<CollapsibleSection value="blend" title="Artisanal Blend">
			<div className={INFO_CARD_CLASS}>
				<div className="divide-separator divide-y divide-dashed">
					<TopicSourcesSection sources={topic.sources} />

					{/* the frequency, its time and (weekly only) day, the last scan age, and how long that scan took */}
					<InfoSection label="Schedule">
						{toScheduleLabel(topic.frequency, topic.scheduledTime, topic.scheduledDayOfWeek)}
						{topic.isDailyFrequencyPaused && <PausedFrequencyNote />}
						<div className="text-muted-foreground mt-0.5 text-xs">
							last scan {topic.lastScanAt ? toAgeLabel(topic.lastScanAt) : "never"}
						</div>
						{lastScanDuration && <div className="text-muted-foreground text-xs">{lastScanDuration} taken</div>}
					</InfoSection>

					{/* how many findings a scan keeps, worded exactly like the edit modal's select */}
					<InfoSection label="Max results">{`Carl's top ${topic.maxResults}`}</InfoSection>

					{/* this month's total scan spend, visible to the owner or an admin */}
					{topic.monthCostDollars !== null && (
						<InfoSection label="Cost this month">{toDollarLabel(topic.monthCostDollars)}</InfoSection>
					)}
				</div>
			</div>
		</CollapsibleSection>
	)
}

// says that the schedule above is paused because the plan is past its limit with a call to action to upgrade on the pricing page
function PausedFrequencyNote() {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<AnchorLink href="/pricing" className="text-link ml-1.5 text-xs hover:underline">
					not brewing
				</AnchorLink>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				Your plan ran out of daily pots. Carl keeps the ones you've had longest.
			</TooltipContent>
		</Tooltip>
	)
}
