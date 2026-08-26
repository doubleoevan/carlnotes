// what each way an invitation can fail says to the person holding the link
import type { InviteRefusal } from "@shared/contracts"

export const INVITE_REFUSALS: Record<InviteRefusal, string> = {
	revoked: "Carl put that invitation away.",
	expired: "That invitation went cold.",
	exhausted: "That invitation is all poured out.",
	unknown: "Carl doesn't know that invitation.",
}
