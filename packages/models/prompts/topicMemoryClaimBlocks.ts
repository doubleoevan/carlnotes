// the claim wording that the prompts proposing and splitting topic memories share, each block spliced in its own place
import { fetchPromptTemplate } from "./fetch"
import { loadPromptFragment } from "./fragment"
import { writePrompt } from "./write"

// the trusted blocks a prompt that proposes or splits topic memory claims splices
export type TopicMemoryClaimBlocks = {
	topicMemoryClaimDatesBlock: string
	topicMemoryClaimRulesBlock: string
	topicMemoryAsOfClaimsBlock: string
}

/**
 * Returns the claim dates, the claim rules with the claim context written inside them, and the as-of claims.
 */
export async function loadTopicMemoryClaimBlocks(): Promise<TopicMemoryClaimBlocks> {
	const [topicMemoryClaimDatesBlock, claimRules, topicMemoryClaimContextBlock, topicMemoryAsOfClaimsBlock] =
		await Promise.all([
			loadPromptFragment("topic-memory-claim-dates"),
			fetchPromptTemplate("topic-memory-claim-rules"),
			loadPromptFragment("topic-memory-claim-context"),
			loadPromptFragment("topic-memory-as-of-claims"),
		])
	const topicMemoryClaimRulesBlock = writePrompt(claimRules.template, {}, { topicMemoryClaimContextBlock })
	return { topicMemoryClaimDatesBlock, topicMemoryClaimRulesBlock, topicMemoryAsOfClaimsBlock }
}
