import { cn } from "@carlnotes/nightshift/classNames"
import { type ComponentProps, useState } from "react"
import { Button } from "@/components/primitives/button"
import { callMcpViewTool } from "./mcpViewHost"

/**
 * A MCP view's Follow button for a topic, which calls the follow_topic tool through the host and shows the result. A
 * visitor's MCP view shows none.
 */
export function McpViewSubscribeButton({
	topicId,
	isSubscribed,
	isDisabled = false,
	variant,
	className,
}: {
	topicId: string
	isSubscribed: boolean | null
	isDisabled?: boolean
	variant?: ComponentProps<typeof Button>["variant"]
	className?: string
}) {
	// whether the caller subscribes to the topic, as the last call left it, and whether a call is on its way
	const [isCallerSubscribed, setIsCallerSubscribed] = useState(isSubscribed === true)
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	if (isSubscribed === null) {
		return null
	}

	// subscribe or unsubscribe, keeping the old state if the tool rejects the change
	const handleClick = async (): Promise<void> => {
		if (isSaving || isDisabled) {
			return
		}
		setIsSaving(true)
		setError(null)
		try {
			const subscriptionResult = await callMcpViewTool("follow_topic", {
				topic_id: topicId,
				is_following: !isCallerSubscribed,
			})
			if (!subscriptionResult.isError) {
				setIsCallerSubscribed(!isCallerSubscribed)
			} else {
				setError("Following could not be updated.")
			}
		} catch {
			setError("Following could not be updated. Try again.")
		} finally {
			setIsSaving(false)
		}
	}
	return (
		<div className="space-y-1">
			<Button
				size="sm"
				variant={variant ?? (isCallerSubscribed ? "outline" : "default")}
				disabled={isSaving || isDisabled}
				aria-pressed={isCallerSubscribed}
				onClick={() => void handleClick()}
				className={cn("shrink-0", className)}
			>
				{isCallerSubscribed ? "Following" : "Follow"}
			</Button>
			{error && (
				<p role="alert" className="text-destructive text-xs">
					{error}
				</p>
			)}
		</div>
	)
}
