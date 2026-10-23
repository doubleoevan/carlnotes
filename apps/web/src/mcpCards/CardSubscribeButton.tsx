import { useState } from "react"
import { Button } from "@/components/primitives/button"
import { callCardTool } from "./cardHost"

/**
 * A card's Follow button for a topic, which calls the follow_topic tool through the host and shows the result. A
 * visitor's card shows none.
 */
export function CardSubscribeButton({ topicId, isSubscribed }: { topicId: string; isSubscribed: boolean | null }) {
	// whether the caller subscribes to the topic, as the last call left it, and whether a call is on its way
	const [isCallerSubscribed, setIsCallerSubscribed] = useState(isSubscribed === true)
	const [isSaving, setIsSaving] = useState(false)
	if (isSubscribed === null) {
		return null
	}

	// subscribe or unsubscribe, keeping the old state if the tool rejects the change
	const handleClick = async (): Promise<void> => {
		setIsSaving(true)
		try {
			const subscriptionResult = await callCardTool("follow_topic", {
				topic_id: topicId,
				is_following: !isCallerSubscribed,
			})
			if (!subscriptionResult.isError) {
				setIsCallerSubscribed(!isCallerSubscribed)
			}
		} finally {
			setIsSaving(false)
		}
	}
	return (
		<Button
			size="sm"
			variant={isCallerSubscribed ? "outline" : "default"}
			disabled={isSaving}
			aria-pressed={isCallerSubscribed}
			onClick={() => void handleClick()}
			className="shrink-0"
		>
			{isCallerSubscribed ? "Following" : "Follow"}
		</Button>
	)
}
