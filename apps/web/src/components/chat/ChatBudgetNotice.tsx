import { PLANS_PATH, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import { CHAT_REJECTION_COPY } from "@carlnotes/core/lib/chatRejectionCopy"
import { AnchorLink } from "@/components/common/AnchorLink"

// the call to action to keep on chatting when the user's budget runs out
export function ChatBudgetNotice() {
	return (
		<p className="text-muted-foreground text-sm whitespace-pre-line">
			{`${CHAT_REJECTION_COPY.budget}\n`}
			<AnchorLink href={PLANS_PATH} className="sentence-link">
				{PURCHASE_COPY.pickUpMoreCoffee}
			</AnchorLink>
			{" to keep chatting."}
		</p>
	)
}
