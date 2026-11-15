import {
	TopicVideoDialog as SharedTopicVideoDialog,
	type TopicVideoDialogElements,
} from "@carlnotes/core/components/TopicVideoDialog"
import { type ComponentRef, type RefObject, useMemo } from "react"
import type { View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Sheet } from "@/components/common/Sheet"
import { Text } from "@/components/primitives/text"
import { TopicVideoPlayer } from "./TopicVideoPlayer"

const elements: Omit<TopicVideoDialogElements, "Frame"> = {
	Player: TopicVideoPlayer,
	Loading: () => <CoffeeLoading className="aspect-video text-base" />,
	Failure: ({ children }) => (
		<Text accessibilityRole="alert" className="text-sm text-destructive">
			{children}
		</Text>
	),
}

/**
 * Adapts the Video dialog to a sheet, which returns focus to the control that opened it.
 */
export function TopicVideoDialog({
	triggerRef,
	...props
}: {
	podcastEpisodeId: string
	title: string
	shouldPlayOnLoad?: boolean
	onClose: () => void
	triggerRef?: RefObject<ComponentRef<typeof View> | null>
}) {
	// keep the frame renderer stable while the podcast episode loads
	const platformElements = useMemo<TopicVideoDialogElements>(
		() => ({
			...elements,
			// biome-ignore lint/correctness/noComponentHookFactories: memoized on the ref, so the sheet stays mounted
			Frame: ({ title, onClose, children }) => (
				<Sheet title={title} onClose={onClose} triggerRef={triggerRef}>
					{children}
				</Sheet>
			),
		}),
		[triggerRef],
	)
	return <SharedTopicVideoDialog {...props} elements={platformElements} />
}
