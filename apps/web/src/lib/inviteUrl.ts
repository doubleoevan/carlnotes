// the invite url the share menus and the invite fields copy
import { toInvitePath } from "@carlnotes/contracts/seo"

/**
 * Returns the absolute url an invite token is shared as, built against the origin the page is served from.
 */
export function toInviteUrl(token: string): string {
	return `${window.location.origin}${toInvitePath(token)}`
}
