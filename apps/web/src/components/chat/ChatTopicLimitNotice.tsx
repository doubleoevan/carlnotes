import { toChatTopicLimitCopy } from "@carlnotes/core/lib/chatRejectionCopy"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PLANS_ACTION_LABEL, PLANS_PATH } from "./chatRejectionCopy"

// the line the new-topic chat shows in place of the wizard when the plan holds no more topics
export function ChatTopicLimitNotice({ topicLimit }: { topicLimit: number }) {
	return (
		<p className="text-muted-foreground border-t px-3 py-3 text-sm whitespace-pre-line">
			{`${toChatTopicLimitCopy(topicLimit)}\n`}
			<AnchorLink href={PLANS_PATH} className="sentence-link">
				{PLANS_ACTION_LABEL}
			</AnchorLink>
			{" for more, or drop an existing topic from its page."}
		</p>
	)
}
