import type { TopicFeedFilters } from "@carlnotes/core/hooks/useTopicFeedState"
import { router } from "expo-router"
import { Check, Plus, X } from "lucide-react-native"
import { type ComponentRef, useRef, useState } from "react"
import { View } from "react-native"
import { hasSession } from "@/authClient"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { EditTopicModal } from "./EditTopicModal"

/**
 * Matches Home's tags and New Topic row with working tag selection.
 */
export function TopicHomeActions({ filters, knownTags }: { filters: TopicFeedFilters; knownTags: string[] }) {
	// keep tag selection in the shared feed filters
	const [isOpen, setIsOpen] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	return (
		<View className="mx-4 mb-1 flex-row flex-wrap items-center justify-between gap-2">
			<View className="flex-row items-center gap-1">
				<Text className="text-sm text-link">Tags:</Text>
				<Button
					ref={triggerRef}
					size="icon-sm"
					variant="secondary"
					className="rounded-full"
					accessibilityLabel="Add tag"
					onPress={() => setIsOpen(true)}
				>
					<Icon as={Plus} />
				</Button>
			</View>
			<NewTopicButton />
			{filters.tagFilters.length > 0 ? (
				<View className="w-full flex-row flex-wrap gap-1">
					{filters.tagFilters.map((tag) => (
						<Button
							key={tag}
							size="sm"
							variant="secondary"
							className="rounded-full"
							accessibilityLabel={`Remove tag ${tag}`}
							onPress={() => filters.setTagFilters((tags) => tags.filter((selectedTag) => selectedTag !== tag))}
						>
							<Text>{tag}</Text>
							<Icon as={X} className="size-3" />
						</Button>
					))}
				</View>
			) : null}
			{isOpen ? (
				<Sheet title="Tags" triggerRef={triggerRef} onClose={() => setIsOpen(false)}>
					{knownTags.length === 0 ? <Text className="py-3 text-sm text-muted-foreground">No tags yet.</Text> : null}
					{knownTags.map((tag) => (
						<Button
							key={tag}
							variant="ghost"
							className="min-h-12 justify-start"
							accessibilityLabel={tag}
							accessibilityState={{ selected: filters.tagFilters.includes(tag) }}
							onPress={() =>
								filters.setTagFilters((tags) =>
									tags.includes(tag) ? tags.filter((selectedTag) => selectedTag !== tag) : [...tags, tag],
								)
							}
						>
							<Text className="flex-1 text-left">{tag}</Text>
							{filters.tagFilters.includes(tag) ? <Icon as={Check} /> : null}
						</Button>
					))}
				</Sheet>
			) : null}
		</View>
	)
}

/**
 * Opens the same native creation form from a page button or its action menu.
 */
export function NewTopicButton() {
	const { openNewTopicDialog, newTopicDialog } = useNewTopicDialog()
	return (
		<>
			<Button accessibilityLabel="New Topic" onPress={openNewTopicDialog}>
				<Icon as={Plus} className="size-4" />
				<Text>New Topic</Text>
			</Button>
			{newTopicDialog}
		</>
	)
}

/**
 * Shares Topic creation and feed refresh between native entry points.
 */
export function useNewTopicDialog(): { openNewTopicDialog: () => void; newTopicDialog: React.ReactNode } {
	const [isOpen, setIsOpen] = useState(false)
	const state = useTopicFeed()
	return {
		openNewTopicDialog: () => {
			if (!hasSession()) {
				router.push("/sign-up")
				return
			}
			setIsOpen(true)
		},
		newTopicDialog: isOpen && (
			<EditTopicModal
				onClose={() => setIsOpen(false)}
				onTopicSaved={async (topicId) => {
					await state.reheat()
					router.push(`/topics/${topicId}`)
				}}
			/>
		),
	}
}
