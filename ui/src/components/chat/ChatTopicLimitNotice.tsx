import { PLANS_ACTION_LABEL, PLANS_PATH } from "@/components/chat/chatRejectionCopy"
import { AnchorLink } from "@/components/common/AnchorLink"

// the line the new-topic chat shows in place of the wizard when the plan holds no more topics
export function ChatTopicLimitNotice({ topicLimit }: { topicLimit: number }) {
	return (
		<p className="text-muted-foreground border-t px-3 py-3 text-sm whitespace-pre-line">
			{`Your plan has ${topicLimit} topics, and you used them all.\n`}
			<AnchorLink href={PLANS_PATH} className="text-link hover:underline">
				{PLANS_ACTION_LABEL}
			</AnchorLink>
			{" for more, or drop an existing topic from its page."}
		</p>
	)
}
