import { DAILY_TOPICS_USED_LABEL } from "@carlnotes/contracts/scanFailure"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { MAX_TOPIC_SOURCES } from "@carlnotes/contracts/topics"
import { toAgeLabel, toDollarLabel, toDurationLabel, toScheduleLabel } from "@carlnotes/core/lib/labels"
import { usePurchaseOffers } from "@carlnotes/core/stores/purchaseOffersStore"
import type { ReactNode } from "react"
import { View } from "react-native"
import { PlansLink } from "@/components/account/PlansLink"
import { Text } from "@/components/primitives/text"
import { CollapsibleSection } from "./CollapsibleSection"
import { TopicVisibility } from "./TopicInfo"
import { TopicInfoSection as InfoSection } from "./TopicInfoSection"
import { TopicPersonalSourcesSection } from "./TopicPersonalSourcesSection"
import { TopicSources } from "./TopicSources"

/**
 * Matches the web's Artisanal Blend card using the delivered settings.
 */
export function TopicSettingsCard({ topic, personalSources }: { topic: TopicResponse; personalSources?: ReactNode }) {
	// the paused frequency's plans link where the store sells the user a plan
	const { canPurchase } = usePurchaseOffers()
	const hasFooter = topic.monthCostDollars !== null || Boolean(topic.podcast)
	const personalSourcesClassName = hasFooter ? undefined : "border-b border-dashed border-separator-strong"
	return (
		<CollapsibleSection title="Artisanal Blend" hasClosedDivider>
			<View className="rounded-lg border border-separator bg-card p-5 shadow-raised">
				<InfoSection label="Frequency" isFirst>
					<Text className="text-sm">
						{toScheduleLabel(topic.frequency, topic.scheduledTime, topic.scheduledDayOfWeek)}
					</Text>
					{/* paused daily frequency */}
					{topic.isDailyFrequencyPaused ? (
						<Text className="text-xs text-muted-foreground">
							{canPurchase ? <PlansLink label="not brewing" className="text-xs" /> : "not brewing"}
							{`. ${DAILY_TOPICS_USED_LABEL}`}
						</Text>
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
					<InfoSection label={`Sources · ${topic.sources.length} of ${MAX_TOPIC_SOURCES}`}>
						<TopicSources sources={topic.sources} />
					</InfoSection>
				</View>
				{personalSources ?? <TopicPersonalSourcesSection topic={topic} className={personalSourcesClassName} />}
				{hasFooter && <TopicSettingsFooter topic={topic} />}
			</View>
		</CollapsibleSection>
	)
}

// keep the existing cost and podcast footer independent of Personal sources visibility
function TopicSettingsFooter({ topic }: { topic: TopicResponse }) {
	return (
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
	)
}
