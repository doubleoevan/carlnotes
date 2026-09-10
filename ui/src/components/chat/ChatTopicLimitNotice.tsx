import { AnchorLink } from "@/components/common/AnchorLink"

// the line the new-topic chat shows in place of the wizard when the plan holds no more topics
export function ChatTopicLimitNotice({ topicLimit }: { topicLimit: number }) {
	return (
		<p className="text-muted-foreground border-t px-3 py-3 text-sm whitespace-pre-line">
			{`Your plan has ${topicLimit} topics, and you used them all.\n`}
			<AnchorLink href="/plans" className="text-link hover:underline">
				Pick up more coffee
			</AnchorLink>
			{" for more, or drop an existing topic from its page."}
		</p>
	)
}
