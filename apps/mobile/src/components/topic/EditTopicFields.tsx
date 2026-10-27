import { daysOfWeek } from "@carlnotes/contracts/enums"
import type { TopicFields } from "@carlnotes/core/hooks/useTopicFields"
import { capitalize } from "@carlnotes/core/lib/labels"
import {
	FREQUENCY_OPTIONS,
	hasDailySlotLeft,
	isPlanLimitedFrequency,
	toDailyTopicQuotaDescription,
	toDailyTopicQuotaLabel,
} from "@carlnotes/core/lib/topicSchedule"
import DateTimePicker from "@react-native-community/datetimepicker"
import { router } from "expo-router"
import { Coffee } from "lucide-react-native"
import { useState } from "react"
import { Platform, View } from "react-native"
import { useCSSVariable, useUniwind } from "uniwind"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ChoiceSelect } from "@/components/common/ChoiceSelect"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"

/**
 * Keeps the web schedule choices and uses the device's time picker.
 */
export function ScheduleFields<Attachment>({
	fields,
	dailyTopicsRemaining,
	dailyTopicLimit,
	topicFrequency,
}: {
	fields: TopicFields<Attachment>
	dailyTopicsRemaining?: number
	dailyTopicLimit?: number
	topicFrequency?: string
}) {
	const { theme } = useUniwind()
	const accent = useCSSVariable("--color-primary") as string
	const [isPickingTime, setIsPickingTime] = useState(false)
	const [hours, minutes] = fields.scheduledTime.split(":").map(Number)
	const time = new Date(2026, 0, 1, hours, minutes)
	const hasDailySlot = hasDailySlotLeft(dailyTopicsRemaining, topicFrequency)
	const quotaLabel = toDailyTopicQuotaLabel(dailyTopicsRemaining)
	return (
		<View className="gap-2">
			<View className="flex-row flex-wrap items-center gap-2">
				<Text className="text-sm font-medium">Frequency</Text>
				<AnchorLink
					href="/plans"
					accessibilityLabel="Daily topic allowance"
					accessibilityHint={toDailyTopicQuotaDescription(dailyTopicLimit)}
				>
					<Text className="text-xs text-link">{quotaLabel}</Text>
				</AnchorLink>
			</View>
			<View className="flex-row flex-wrap gap-2">
				<ChoiceSelect
					label="Frequency"
					value={fields.frequency}
					options={FREQUENCY_OPTIONS.map((frequency) => ({
						value: frequency,
						label: capitalize(frequency),
						icon: isPlanLimitedFrequency({ frequency, hasDailySlot }) ? Coffee : undefined,
					}))}
					onChange={(frequency) => {
						if (isPlanLimitedFrequency({ frequency, hasDailySlot })) {
							router.push("/plans")
						} else {
							fields.setFrequency(frequency as typeof fields.frequency)
						}
					}}
				/>
				<Button variant="outline" accessibilityLabel="Scheduled time" onPress={() => setIsPickingTime(!isPickingTime)}>
					<Text>{time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</Text>
				</Button>
				{fields.frequency === "weekly" && (
					<ChoiceSelect
						label="Scheduled day of week"
						value={fields.scheduledDayOfWeek}
						options={daysOfWeek.map((day) => ({ value: day, label: capitalize(day) }))}
						onChange={(day) => fields.setScheduledDayOfWeek(day as typeof fields.scheduledDayOfWeek)}
					/>
				)}
			</View>
			{isPickingTime && (
				<DateTimePicker
					accessibilityLabel="Scheduled time"
					value={time}
					mode="time"
					display={Platform.OS === "ios" ? "spinner" : "default"}
					themeVariant={theme === "dark" ? "dark" : "light"}
					accentColor={accent}
					onChange={(event, value) => {
						if (Platform.OS !== "ios" || event.type === "dismissed") {
							setIsPickingTime(false)
						}
						if (value && event.type === "set") {
							fields.setScheduledTime(
								`${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`,
							)
						}
					}}
				/>
			)}
		</View>
	)
}
