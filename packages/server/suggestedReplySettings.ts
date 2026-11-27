// the suggested reply's rollout setting: which private chats write a suggested reply after carl's reply. every private
// chat by default, the new-topic chat alone, or none

import { readEnumSetting } from "./envSettings"

// the chats SUGGESTED_REPLY_CHATS may turn on
const suggestedReplyChats = ["all", "new-topic", "off"] as const

// which chats the setting turns on
type SuggestedReplyChats = (typeof suggestedReplyChats)[number]

/**
 * Returns which private chats write suggested replies: every one unless SUGGESTED_REPLY_CHATS says new-topic or off.
 * Any other value throws, so a typo never turns them off unnoticed.
 */
export function readSuggestedReplyChats(): SuggestedReplyChats {
	return readEnumSetting({
		settingName: "SUGGESTED_REPLY_CHATS",
		value: Bun.env.SUGGESTED_REPLY_CHATS?.trim(),
		allowedValues: suggestedReplyChats,
		defaultValue: "all",
	})
}

/**
 * Whether a private chat writes suggested replies: the new-topic chat unless the setting is off, and a Topic's, a
 * team's, or a Topic Post's private chat only while the setting is all.
 */
export function isSuggestedReplyOn({ isNewTopicChat }: { isNewTopicChat: boolean }): boolean {
	const turnedOnChats = readSuggestedReplyChats()
	return turnedOnChats === "all" || (isNewTopicChat && turnedOnChats === "new-topic")
}
