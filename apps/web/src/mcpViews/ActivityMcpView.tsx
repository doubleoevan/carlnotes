// the activity MCP view: the caller's followed topics and the topic invites they sent, as the Activity page lists them
import type { ActivityResponse, SubscriptionRow } from "@carlnotes/contracts/activity"
import type { McpViewActivity } from "@carlnotes/contracts/mcpViews"
import { ActivitySections } from "@carlnotes/core/components/ActivitySections"
import { AvatarHeader } from "@carlnotes/core/components/AvatarHeader"
import { TopicSubscriptionsTable } from "@carlnotes/core/components/TopicSubscriptionsTable"
import { Activity } from "lucide-react"
import { useState } from "react"
import { ACTIVITY_SECTIONS_ELEMENTS } from "@/components/activity/ActivitySections"
import { WEB_AVATAR_HEADER_ELEMENTS } from "@/components/common/avatarHeaderElements"
import { TopicInvitesTable } from "@/components/table/TopicInvitesTable"
import { TOPIC_SUBSCRIPTIONS_TABLE_ELEMENTS } from "@/components/table/TopicSubscriptionsTable"
import { PAGE_HEADER_CLASS, PAGE_TITLE_CLASS } from "@/lib/styleClasses"
import { callMcpViewTool, toMcpViewData, toToolResultText } from "./mcpViewHost"

// the line a write shows if its tool call throws an error
const ACTIVITY_SAVE_FAILED_TEXT = "That change didn't save. Try again."

// the tool that reads the activity again after a write
const READ_ACTIVITY_TOOL = "read_activity"

/**
 * The activity MCP view: the Activity page's heading, the caller's avatar header, and its two sections. A
 * subscription's Active switch calls follow_topic, and a pending invite's switch and delete call respond_to_invite.
 * The Emails switch, a subscription's delete, and a sent invite's withdraw have no tool, so the MCP view leaves them
 * out.
 */
export function ActivityMcpView({ mcpViewActivity }: { mcpViewActivity: McpViewActivity }) {
	// the activity as the last read left it, whether a write is on its way, and the last write's error
	const [activity, setActivity] = useState<ActivityResponse>(mcpViewActivity.activity)
	const [isSaving, setIsSaving] = useState(false)
	const [saveError, setSaveError] = useState<string | null>(null)

	// call a write's tool, then read the activity again so the tables show what the server kept
	async function callActivityTool(toolName: string, toolArguments: Record<string, unknown>): Promise<void> {
		setIsSaving(true)
		setSaveError(null)
		try {
			const writeToolResult = await callMcpViewTool(toolName, toolArguments)
			if (writeToolResult.isError) {
				setSaveError(toToolResultText(writeToolResult.content))
				return
			}
			const readActivityToolResult = await callMcpViewTool(READ_ACTIVITY_TOOL, {})
			const rereadMcpViewActivity = toMcpViewData(readActivityToolResult._meta).activity
			if (rereadMcpViewActivity) {
				setActivity(rereadMcpViewActivity.activity)
			}
		} catch {
			setSaveError(ACTIVITY_SAVE_FAILED_TEXT)
		} finally {
			setIsSaving(false)
		}
	}

	// a pending invite's switch accepts it, and any other row's follows or unfollows its topic
	const handleActiveChange = (row: SubscriptionRow, isActive: boolean): void => {
		if (row.inviteId) {
			void callActivityTool("respond_to_invite", { invite_id: row.inviteId, is_accepted: true })
			return
		}
		void callActivityTool("follow_topic", { topic_id: row.topicId, is_following: isActive })
	}
	return (
		<div>
			{/* the page's title with the same icon as its header menu item */}
			<div className={PAGE_HEADER_CLASS}>
				<h1 className={PAGE_TITLE_CLASS}>
					<Activity className="size-6" />
					Activity
				</h1>
			</div>
			<AvatarHeader subject={{ subjectKind: "user", user: activity.user }} elements={WEB_AVATAR_HEADER_ELEMENTS} />
			{/* the last write's error over the sections */}
			{saveError && (
				<p role="alert" className="text-destructive mt-4 text-sm">
					{saveError}
				</p>
			)}
			{/* the followed topics with their tool-backed switches, and the sent invites read-only */}
			<ActivitySections
				activity={activity}
				isOwnView
				renderSubscriptionsTable={(subscriptions) => (
					<TopicSubscriptionsTable
						subscriptions={subscriptions}
						isDisabled={isSaving}
						onActiveChange={handleActiveChange}
						onDelete={(row) => callActivityTool("respond_to_invite", { invite_id: row.inviteId, is_accepted: false })}
						isRemovable={(row) => row.inviteId !== null}
						elements={TOPIC_SUBSCRIPTIONS_TABLE_ELEMENTS}
					/>
				)}
				renderInvitesTable={(invites) => <TopicInvitesTable invites={invites} onReload={() => {}} isReadOnly />}
				elements={ACTIVITY_SECTIONS_ELEMENTS}
			/>
		</div>
	)
}
