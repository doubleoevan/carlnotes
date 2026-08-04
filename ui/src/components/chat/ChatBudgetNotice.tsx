import { AnchorLink } from "@/components/common/AnchorLink"

// the call to action to keep on chatting when the user's budget runs out
export function ChatBudgetNotice() {
	return (
		<p className="text-muted-foreground text-sm whitespace-pre-line">
			{"Carl is staring at an empty mug.\n"}
			<AnchorLink href="/pricing" className="text-link hover:underline">
				Pick up more coffee
			</AnchorLink>
			{" to keep chatting."}
		</p>
	)
}
