import { authClient } from "@carlnotes/client/authClient"
import {
	JOURNAL_BUTTON_ICON,
	JOURNAL_BUTTON_LABEL,
	TopicMemoriesDialog as SharedTopicMemoriesDialog,
	TAKEAWAYS_TITLE,
	toScanHistoryCounts,
} from "@carlnotes/core/components/TopicMemoriesDialog"
import type { TopicMemoriesClient } from "@carlnotes/core/hooks/useTopicMemories"
import { type ComponentRef, useRef, useState } from "react"
import { type Pressable, View } from "react-native"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { PLAIN_PAGE_BUTTON_CLASS, PLAIN_PAGE_BUTTON_TEXT_CLASS } from "@/pageButtonClasses"
import { topicMemoriesDialogElements } from "./topicMemoriesDialogElements"

type TopicMemoriesDialogProps = {
	topicId: string
	entryCount: number
	takeawayCount?: number
	canRateTakeaways?: boolean
	onTakeawayRemoved?: () => void
	client?: TopicMemoriesClient
}

/** Opens the shared Takeaways Journal in the native focus-restoring Sheet. */
export function TopicMemoriesDialog({
	topicId,
	entryCount,
	takeawayCount,
	canRateTakeaways,
	onTakeawayRemoved,
	client,
}: TopicMemoriesDialogProps) {
	// the Sheet returns focus to the independent Journal control when it closes
	const { data: session } = authClient().useSession()
	const userId = session?.user.id ?? null
	const [isOpen, setIsOpen] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof Pressable>>(null)
	return (
		<>
			{/* The count and Journal sit beside the accordion trigger. */}
			<View className="max-w-[60%] shrink flex-row flex-wrap items-center justify-end gap-2 sm:max-w-none">
				<Text className="shrink text-right text-sm text-muted-foreground">
					{toScanHistoryCounts(entryCount, takeawayCount)}
				</Text>
				<Button
					ref={triggerRef}
					variant="outline"
					className={PLAIN_PAGE_BUTTON_CLASS}
					accessibilityLabel={JOURNAL_BUTTON_LABEL}
					accessibilityState={{ expanded: isOpen }}
					onPress={() => setIsOpen(true)}
				>
					<Text>{JOURNAL_BUTTON_ICON}</Text>
					<Text className={PLAIN_PAGE_BUTTON_TEXT_CLASS}>{JOURNAL_BUTTON_LABEL}</Text>
				</Button>
			</View>
			{isOpen && (
				<Sheet title={TAKEAWAYS_TITLE} triggerRef={triggerRef} onClose={() => setIsOpen(false)}>
					<SharedTopicMemoriesDialog
						key={`${topicId}:${userId ?? ""}`}
						topicId={topicId}
						userId={userId}
						elements={topicMemoriesDialogElements}
						canRateTakeaways={canRateTakeaways}
						onTakeawayRemoved={onTakeawayRemoved}
						client={client}
					/>
				</Sheet>
			)}
		</>
	)
}
