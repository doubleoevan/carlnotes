import { onlineManager } from "@tanstack/react-query"
import { useSyncExternalStore } from "react"
import { ScrollView, Text, View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Button } from "@/components/primitives/button"
import { Text as ButtonText } from "@/components/primitives/text"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { TopicFeedSkeleton } from "./TopicFeedSkeleton"
import { TopicSkeleton, type TopicSkeletonProps } from "./TopicSkeleton"

// refresh errors share the retry path with a first failed read
export type TopicFeedStatusProps = {
	topicLabel: "topic" | "topics"
	isLoading?: boolean
	hasError?: boolean
	hasContent?: boolean
	onRetry: () => void
} & TopicSkeletonProps

/**
 * Announces loading and failed reads while keeping saved content on screen.
 */
export function TopicFeedStatus({
	topicLabel,
	isLoading,
	hasError,
	hasContent = false,
	topicPreview,
	onRetry,
}: TopicFeedStatusProps) {
	// show a paused first read as offline and clear that message when connectivity returns
	const isOnline = useSyncExternalStore(subscribeToNetwork, readNetworkState)
	const shouldShowFailure = hasError || !isOnline
	if (!isLoading && !shouldShowFailure) {
		return null
	}
	if (isLoading && !hasContent && !shouldShowFailure) {
		return (
			<ScrollView className="w-full flex-1" contentContainerStyle={{ paddingBottom: 24 }}>
				{/* announce the read once while the matching page shapes remain decorative */}
				<CoffeeLoading label={`Loading your ${topicLabel}`} className="justify-start gap-3 px-4 py-3" />
				{topicLabel === "topic" ? <TopicSkeleton topicPreview={topicPreview} /> : <TopicFeedSkeleton />}
			</ScrollView>
		)
	}
	if (!shouldShowFailure) {
		return null
	}
	return (
		<View className="gap-3 p-4" accessibilityLiveRegion="polite">
			{shouldShowFailure ? (
				<>
					<Text style={toTypeRoleStyle("body")} className="text-muted-foreground">
						{isOnline ? `Your ${topicLabel} couldn't refresh.` : "You're offline."}
						{hasContent
							? " Your last loaded findings are still here."
							: ` Connect and try again to load your ${topicLabel}.`}
					</Text>
					<Button variant="outline" accessibilityLabel="Try refreshing again" onPress={onRetry} className="self-start">
						<ButtonText>Try again</ButtonText>
					</Button>
				</>
			) : null}
		</View>
	)
}

// subscribe without exposing Query's manager as a callback receiver
function subscribeToNetwork(onChange: () => void): () => void {
	return onlineManager.subscribe(onChange)
}
function readNetworkState(): boolean {
	return onlineManager.isOnline()
}
