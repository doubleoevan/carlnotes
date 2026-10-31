import { toClockLabel } from "@carlnotes/core/lib/labels"
import { ArrowUp, X } from "lucide-react-native"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import type { VoiceRecording } from "./useVoiceRecording"

/**
 * Shows the web's recording bar, which replaces the composer's box while a recording runs: Cancel, the level meter, the
 * timer, and Send. The recording sends itself once the speaker stops, and Send sends it early.
 */
export function RecordingBar({ voiceRecording }: { voiceRecording: VoiceRecording }) {
	const meterPercent = Math.round(voiceRecording.level * 100)
	return (
		<View className="flex-1 flex-row items-center gap-2">
			<Button variant="ghost" size="icon" accessibilityLabel="Cancel" onPress={voiceRecording.cancel}>
				<Icon as={X} className="size-4 text-muted-foreground" />
			</Button>
			{/* the level meter fills with the microphone's level. the timer is the bar's word for a screen reader */}
			<View
				accessibilityElementsHidden
				importantForAccessibility="no-hide-descendants"
				className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
			>
				<View className="h-full rounded-full bg-primary" style={{ width: `${meterPercent}%` }} />
			</View>
			{/* the timer, in minutes and seconds, which grows with the system text size */}
			<Text className="min-w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
				{toClockLabel(voiceRecording.secondsElapsed)}
			</Text>
			<Button size="icon" accessibilityLabel="Send" onPress={voiceRecording.send}>
				<Icon as={ArrowUp} className="size-4" />
			</Button>
		</View>
	)
}
