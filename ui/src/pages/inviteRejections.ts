// what each way an invitation can fail shows to the person holding the link
import type { InviteRejection } from "@shared/contracts"

export const INVITE_REJECTIONS: Record<InviteRejection | "teamFull", string> = {
	expired: "That invitation went cold.",
	exhausted: "That invitation is all poured out.",
	teamFull: "That team is full to the brim.",
	unknown: "Carl doesn't know that invitation.",
}
