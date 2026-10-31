// the lines the push permission sheet and the account's Notifications section say, plain facts about what a push
// notification tells you, and the label every action that opens the phone's settings shares

// the sheet that explains the notifications before the system asks
export const PUSH_PERMISSION_SHEET = {
	title: "Turn on notifications?",
	body: "Carl will tell you when he keeps new findings on a topic you follow, and when someone mentions or replies to you in a team chat. Nothing else.",
	acceptLabel: "Turn on notifications",
	declineLabel: "Not now",
} as const

// the account section's heading, its note on Topic pushes, and one label per switch, which names the kind's Android
// notification channel too
export const NOTIFICATIONS_SECTION_TITLE = "Notifications"
export const NOTIFICATIONS_SECTION_TEXT = "A topic notifies you only while you follow it with its emails on."
export const TOPIC_PUSH_LABEL = "New findings on topics you follow"
export const CHAT_MENTION_PUSH_LABEL = "Mentions and replies in team chats"

// what the section says before the phone was asked, and after the phone's settings turned notifications off
export const PUSH_UNDETERMINED_TEXT = "Notifications are off on this phone."
export const PUSH_DENIED_TEXT = "Notifications are off for CarlNotes in your phone's settings."

// the label of every action that opens the phone's settings: the Notifications section's and a rejected microphone
// request's notice
export const OPEN_SETTINGS_LABEL = "Open settings"
