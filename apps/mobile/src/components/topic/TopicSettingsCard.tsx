import type { TopicResponse } from "@carlnotes/contracts/topics"
import { toAgeLabel, toDollarLabel, toDurationLabel, toScheduleLabel } from "@carlnotes/core/lib/labels"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Text } from "@/components/primitives/text"
import { CollapsibleSection } from "./CollapsibleSection"
import { InfoSection, TopicVisibility } from "./TopicInfo"
import { TopicSources } from "./TopicSources"

/**
 * Matches the web's Artisanal Blend card using the delivered settings.
 */
export function TopicSettingsCard({ topic }: { topic: TopicResponse }) {
	return (
		<CollapsibleSection title="Artisanal Blend">
			<View className="rounded-lg border border-separator bg-card p-5 shadow-raised">
				<InfoSection label="Frequency" isFirst>
					<Text className="text-sm">
						{toScheduleLabel(topic.frequency, topic.scheduledTime, topic.scheduledDayOfWeek)}
					</Text>
					{topic.isDailyFrequencyPaused ? (
						<AnchorLink
							href={`${SITE_URL}/plans`}
							accessibilityLabel="Not brewing. See plans"
							accessibilityHint="Your plan ran out of daily pots. Carl keeps the ones you've had longest."
							className="min-h-11 justify-center"
						>
							<Text className="text-xs text-link">not brewing</Text>
						</AnchorLink>
					) : null}
					<Text className="text-xs text-muted-foreground">
						last scan {topic.lastScanAt ? toAgeLabel(topic.lastScanAt) : "never"}
					</Text>
					{toDurationLabel(topic.lastScanDurationMs) ? (
						<Text className="text-xs text-muted-foreground">{toDurationLabel(topic.lastScanDurationMs)} taken</Text>
					) : null}
				</InfoSection>
				<View className="flex-row justify-between gap-3 border-t border-dashed border-separator-strong">
					<InfoSection label="Max findings">
						<Text className="text-sm">{`Carl's top ${topic.maxTopicFindings}`}</Text>
					</InfoSection>
					<InfoSection label="Visibility">
						<TopicVisibility visibility={topic.visibility} />
					</InfoSection>
				</View>
				<View className="border-t border-dashed border-separator-strong">
					<InfoSection label="Sources">
						<TopicSources sources={topic.sources} />
					</InfoSection>
				</View>
				{topic.monthCostDollars !== null || topic.podcast ? (
					<View className="flex-row justify-between gap-3 border-t border-dashed border-separator-strong">
						{topic.monthCostDollars !== null ? (
							<InfoSection label="Cost this month">
								<Text className="text-sm">{toDollarLabel(topic.monthCostDollars)}</Text>
							</InfoSection>
						) : null}
						{topic.podcast ? (
							<InfoSection label="Podcast">
								<Text className="text-right text-sm">{topic.podcast.isEnabled ? "On" : "Off"}</Text>
							</InfoSection>
						) : null}
					</View>
				) : null}
			</View>
		</CollapsibleSection>
	)
}
