// what a rejected chat turn says, in carl's words, which the chat turn notice, the budget notice, and a rejected
// transcription's toast share
import type { ChatRejection } from "@/clients/chatClient"

/** The sentence for each chat rejection. */
export const CHAT_REJECTION_COPY: Record<ChatRejection, string> = {
	budget: "Carl is staring at an empty mug.",
	rateLimited: "Carl needs a minute to catch up. Ask again shortly.",
	forbidden: "Carl can't talk about that.",
	failed: "Carl lost his train of thought.",
}
