import { PURCHASE_COPY } from "@carlnotes/contracts/plans"
import { CHAT_REJECTION_COPY } from "@carlnotes/core/lib/chatRejectionCopy"
import type { PurchaseOffers } from "@carlnotes/core/lib/storefrontPurchaseRules"
import { PlansLink } from "@/components/account/PlansLink"
import { Text } from "@/components/primitives/text"

/**
 * Shows the spent budget's line, with the web's plans link to keep chatting if the store sells the user a plan.
 */
export function ChatBudgetNotice({ canPurchase }: Pick<PurchaseOffers, "canPurchase">) {
	return (
		<Text className="text-sm text-muted-foreground">
			{CHAT_REJECTION_COPY.budget}
			{canPurchase && (
				<>
					{"\n"}
					<PlansLink label={PURCHASE_COPY.pickUpMoreCoffee} />
					{" to keep chatting."}
				</>
			)}
		</Text>
	)
}
