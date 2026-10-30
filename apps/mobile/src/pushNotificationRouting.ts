// where opening a push goes, and whether a push is for the screen already open. a push opens its site link through
// the app's link rules only for the account it was sent to, and anything else opens Home

import { pushNotificationData } from "@carlnotes/contracts/pushDevices"
import { isSiteUrl } from "@carlnotes/contracts/site"
import { toLinkedPath, toLinkedPathWithQuery } from "./nativeIntent"

/**
 * Returns the path that opening a push goes to: its Topic or room for the signed-in account it was sent to, and Home
 * for another account's push, a signed-out phone, or data that is not a site link.
 */
export function toPushOpenPath(pushData: unknown, sessionUserId: string | null): string {
	// only a well-formed push for this account, linking into the site, opens its page
	const parsedPushData = pushNotificationData.safeParse(pushData)
	const isOwnSiteLink =
		parsedPushData.success &&
		parsedPushData.data.recipientUserId === sessionUserId &&
		isSiteUrl(parsedPushData.data.url)
	if (!isOwnSiteLink || !sessionUserId) {
		return "/"
	}

	// the signed-in account opens the link as it would an app link
	return toLinkedPath({ link: parsedPushData.data.url, hasSession: true, rememberReturnPath: () => {} })
}

/**
 * Returns whether a push links to the screen on display, its path with the room's team when a Topic's room shows one.
 */
export function isPushForPath(pushData: unknown, shownPath: string): boolean {
	const parsedPushData = pushNotificationData.safeParse(pushData)
	if (!parsedPushData.success || !isSiteUrl(parsedPushData.data.url)) {
		return false
	}
	return toLinkedPathWithQuery(parsedPushData.data.url) === shownPath
}

/**
 * Returns whether a push was sent to the given account.
 */
export function isPushForAccount(pushData: unknown, userId: string | null): boolean {
	const parsedPushData = pushNotificationData.safeParse(pushData)
	return parsedPushData.success && userId !== null && parsedPushData.data.recipientUserId === userId
}
