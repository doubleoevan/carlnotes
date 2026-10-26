import type { TopicFeedFilters } from "@carlnotes/core/hooks/useTopicFeedState"
import { Check, Plus, X } from "lucide-react-native"
import { type ComponentRef, useRef, useState } from "react"
import { View } from "react-native"
import { Sheet } from "@/components/common/Sheet"
import { WebFeatureButton } from "@/components/common/WebFeature"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

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
 * Keeps the web's New Topic action visible while creation opens on the web.
 */
export function NewTopicButton() {
	return (
		<WebFeatureButton
			title="New topic"
			label="New Topic"
			className="min-h-11 rounded-lg px-3"
			description="Create a topic with Carl or the editor on carlnotes.com. The mobile editor is not available yet."
			icon={Plus}
		/>
	)
}
