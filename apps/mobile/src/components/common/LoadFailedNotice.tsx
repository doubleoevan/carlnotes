import { cn } from "@carlnotes/nightshift/classNames"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"

type LoadFailedNoticeProps = {
	message: string
	retryLabel: string
	onRetry: () => void
	className?: string
}

/** Renders a failed-read message with a Try again button. */
export function LoadFailedNotice({ message, retryLabel, onRetry, className }: LoadFailedNoticeProps) {
	return (
		<View className={cn("gap-3", className)} accessibilityLiveRegion="polite">
			<Text className="text-muted-foreground">{message}</Text>
			<Button variant="outline" accessibilityLabel={retryLabel} onPress={onRetry} className="self-start">
				<Text>Try again</Text>
			</Button>
		</View>
	)
}
