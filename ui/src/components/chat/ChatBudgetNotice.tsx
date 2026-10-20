import { CHAT_REJECTION_COPY, PLANS_ACTION_LABEL, PLANS_PATH } from "@/components/chat/chatRejectionCopy"
import { AnchorLink } from "@/components/common/AnchorLink"

// the call to action to keep on chatting when the user's budget runs out
export function ChatBudgetNotice() {
	return (
		<p className="text-muted-foreground text-sm whitespace-pre-line">
			{`${CHAT_REJECTION_COPY.budget}\n`}
			<AnchorLink href={PLANS_PATH} className="text-link hover:underline">
				{PLANS_ACTION_LABEL}
			</AnchorLink>
			{" to keep chatting."}
		</p>
	)
}
