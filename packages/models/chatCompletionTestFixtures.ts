// the chat completion that a test's stubbed LiteLLM proxy returns, whose message content is the text the test gives

/**
 * Returns one chat completion response from the proxy, with the given text as the assistant's message.
 */
export function toChatCompletionResponse(content: string): Response {
	return Response.json({
		id: "chatcmpl-1",
		object: "chat.completion",
		created: 0,
		model: "cheap-model",
		choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
		usage: { prompt_tokens: 120, completion_tokens: 6, total_tokens: 126 },
	})
}
