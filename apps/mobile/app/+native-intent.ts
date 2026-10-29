// the app's handling of a link that opens it: a visitor's link to an account screen opens sign-in and comes back
import { hasSession } from "@/authClient"
import { toLinkedPath } from "@/nativeIntent"
import { rememberSessionReturnPath } from "@/sessionReturnPath"

/**
 * Rewrites a link before the router opens it. Expo Router passes the whole link, scheme and host included.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
	return toLinkedPath({ link: path, hasSession: hasSession(), rememberReturnPath: rememberSessionReturnPath })
}
