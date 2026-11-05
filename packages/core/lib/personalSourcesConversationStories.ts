// fictional destinations demonstrate provider marks without live conversations
export const PERSONAL_SOURCES_CONVERSATION_EXAMPLES = {
	codex: { label: "Codex", href: "codex://threads/00000000-0000-4000-8000-000000000001" },
	claude: { label: "Claude", href: "https://claude.ai/chat/fictional-private-reference" },
	claudeCode: { label: "Claude Code", href: "https://claude.ai/code/fictional-private-reference" },
	chatgpt: { label: "ChatGPT", href: "https://chatgpt.com/c/fictional-private-reference" },
	gemini: { label: "Gemini", href: "https://gemini.google.com/app/fictional-private-reference" },
	geminiShared: { label: "Gemini shared chat", href: "https://g.co/gemini/share/fictional-reference" },
	cursorShared: { label: "Cursor shared transcript", href: "https://cursor.com/s/fictional-reference" },
	copilotWork: { label: "Microsoft 365 Copilot", href: "https://m365.cloud.microsoft/chat/fictional-reference" },
	grok: { label: "Grok", href: "https://grok.com/c/fictional-private-reference" },
	perplexity: { label: "Perplexity", href: "https://www.perplexity.ai/search/fictional-private-reference" },
	deepseek: { label: "DeepSeek", href: "https://chat.deepseek.com/a/chat/s/fictional-private-reference" },
	cursor: { label: "Cursor", href: "https://cursor.com/agents/fictional-private-reference" },
	copilot: { label: "Microsoft Copilot", href: "https://copilot.microsoft.com/chats/fictional-private-reference" },
	other: { label: "Other platform", href: "https://example.com/conversations/fictional-private-reference" },
	vscode: { label: "VS Code / local agent without a conversation URL", href: null },
} as const
