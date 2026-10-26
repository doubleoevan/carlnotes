import { showClientError } from "@carlnotes/client/apiClient"
import { sendTopicSubscription } from "@carlnotes/client/topicClient"
import { toTopicPath } from "@carlnotes/contracts/seo"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { Coffee, EllipsisVertical, PawPrint, Pencil, Users } from "lucide-react-native"
import { type ComponentRef, useRef, useState } from "react"
import { View } from "react-native"
import { Sheet } from "@/components/common/Sheet"
import { WebFeatureButton } from "@/components/common/WebFeature"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { ShareTopic } from "@/components/share/ShareTopic"
import { NewTopicButton } from "./TopicHomeActions"

/**
 * Places the page's secondary action and call to action as on the web.
 */
export function TopicActionBar({ topic }: { topic: TopicResponse }) {
	// use the same precedence as the signed-in web action bar
	const canScan = topic.manualScansRemaining !== null
	return (
		<View className="mx-4 mt-1 mb-3 flex-row items-center justify-between gap-3">
			<TopicSecondaryAction topic={topic} />
			{canScan ? (
				<WebFeatureButton
					title="Brew"
					description="Start and manage a brew from this topic on carlnotes.com."
					path={toTopicPath(topic)}
					icon={Coffee}
				/>
			) : (
				<NewTopicButton />
			)}
		</View>
	)
}

// select the secondary action from the same topic permissions as the web
function TopicSecondaryAction({ topic }: { topic: TopicResponse }) {
	const isJoinable = topic.manualScansRemaining === null && topic.roomTeams.length === 0 && topic.teamLink !== null
	if (isJoinable) {
		return (
			<WebFeatureButton
				title="Join team"
				description="Request to join this topic’s team on carlnotes.com."
				path={toTopicPath(topic)}
				icon={Users}
				variant="outline"
			/>
		)
	}
	if (topic.isTopicOwner || topic.visibility !== "private") {
		return (
			<WebFeatureButton
				title="Add topic to team"
				label="Team Up"
				description="Choose a team for this topic on carlnotes.com."
				path={toTopicPath(topic)}
				icon={Users}
				variant="outline"
			/>
		)
	}
	return <ShareTopic topic={topic} isLabeled />
}

/**
 * Shows the web's page action menu with native refresh and follow actions.
 */
export function TopicPageActions({
	topic,
	title = topic ? "Topic actions" : "Home actions",
	onRefresh,
}: {
	topic?: TopicResponse
	title?: string
	onRefresh: () => void
}) {
	// return focus to the page menu trigger
	const [isOpen, setIsOpen] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)

	return (
		<>
			<Button ref={triggerRef} variant="ghost" size="icon" accessibilityLabel={title} onPress={() => setIsOpen(true)}>
				<Icon as={EllipsisVertical} className="size-4 text-muted-foreground" />
			</Button>
			{isOpen ? (
				<Sheet title={title} triggerRef={triggerRef} onClose={() => setIsOpen(false)}>
					{topic ? <SubscribeOption topic={topic} onRefresh={onRefresh} onClose={() => setIsOpen(false)} /> : null}
					{topic ? <ShareTopic topic={topic} isLabeled /> : null}
					{topic?.canEdit ? (
						<WebFeatureButton
							title="Edit topic"
							description="Edit the topic, prompt, and Sources on carlnotes.com."
							path={toTopicPath(topic)}
							icon={Pencil}
							variant="ghost"
							className="min-h-12 justify-start"
						/>
					) : null}
					{topic?.isTopicOwner ? (
						<WebFeatureButton
							title="Add topic to team"
							description="Choose a team for this topic on carlnotes.com."
							path={toTopicPath(topic)}
							icon={Users}
							variant="ghost"
							className="min-h-12 justify-start"
						/>
					) : null}
					<Button
						variant="ghost"
						className="min-h-12 justify-start"
						accessibilityLabel="Reheat"
						onPress={() => {
							onRefresh()
							setIsOpen(false)
						}}
					>
						<Icon as={Coffee} className="text-muted-foreground" />
						<Text>Reheat</Text>
					</Button>
				</Sheet>
			) : null}
		</>
	)
}

// save a follow choice only when the user may follow this topic
function SubscribeOption({
	topic,
	onRefresh,
	onClose,
}: {
	topic: TopicResponse
	onRefresh: () => void
	onClose: () => void
}) {
	// prevent overlapping subscription requests
	const [isSaving, setIsSaving] = useState(false)
	const handleToggleSubscription = async (): Promise<void> => {
		if (!topic || isSaving) {
			return
		}
		setIsSaving(true)
		try {
			// save the choice and refresh the page before dismissing
			await sendTopicSubscription(topic.id, !topic.isSubscribed)
			onRefresh()
			onClose()
		} catch {
			showClientError("That didn't go through. Try again.")
		} finally {
			setIsSaving(false)
		}
	}
	if (topic.isTopicOwner || topic.visibility === "private") {
		return null
	}
	return (
		<Button
			variant="ghost"
			className="min-h-12 justify-start"
			accessibilityLabel={topic.isSubscribed ? "Unfollow topic" : "Follow topic"}
			disabled={isSaving}
			onPress={() => void handleToggleSubscription()}
		>
			<Icon
				as={PawPrint}
				className={topic.isSubscribed ? "text-primary" : "text-muted-foreground"}
				fill={topic.isSubscribed ? "currentColor" : "none"}
			/>
			<Text>{topic.isSubscribed ? "Unfollow topic" : "Follow topic"}</Text>
		</Button>
	)
}
