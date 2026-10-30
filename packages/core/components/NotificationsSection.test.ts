// Notifications section tests: the switches read off before a grant, on after it, and off once turned off, are
// disabled while a save runs or the phone refuses, and return to the saved value after a failed save
import { expect, test } from "bun:test"
import { toNotificationSwitchStates } from "./NotificationsSection"

// the preferences before the first grant, and after it with mentions turned off
const NEVER_CHOSEN = { isTopicPushEnabled: null, isChatMentionPushEnabled: null }
const MENTIONS_OFF = { isTopicPushEnabled: true, isChatMentionPushEnabled: false }

// before the first grant both read off, and the grant's saved true turns both on
test("both switches read off before the first grant and on after it", () => {
	const neverAskedStates = toNotificationSwitchStates({
		pushPermission: "undetermined",
		pushPreferences: NEVER_CHOSEN,
		savingKind: null,
	})
	expect(neverAskedStates["topic-scan"]).toEqual({ isChecked: false, isDisabled: true })
	const grantedStates = toNotificationSwitchStates({
		pushPermission: "granted",
		pushPreferences: { isTopicPushEnabled: true, isChatMentionPushEnabled: true },
		savingKind: null,
	})
	expect(grantedStates).toEqual({
		"topic-scan": { isChecked: true, isDisabled: false },
		"chat-mention": { isChecked: true, isDisabled: false },
	})
})

// a switch turned off stays off, and a save in flight, or a failed one that left the saved value, shows that value
test("a switch turned off stays off, and a save disables both until it ends", () => {
	const savingStates = toNotificationSwitchStates({
		pushPermission: "granted",
		pushPreferences: MENTIONS_OFF,
		savingKind: "chat-mention",
	})
	expect(savingStates["chat-mention"]).toEqual({ isChecked: false, isDisabled: true })
	expect(savingStates["topic-scan"]).toEqual({ isChecked: true, isDisabled: true })
})

// a refusal disables both and shows them off, whatever was saved
test("a refused permission shows both switches off and disabled", () => {
	const deniedStates = toNotificationSwitchStates({
		pushPermission: "denied",
		pushPreferences: MENTIONS_OFF,
		savingKind: null,
	})
	expect(deniedStates["topic-scan"]).toEqual({ isChecked: false, isDisabled: true })
})
