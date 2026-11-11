// a team's identity, which a card, a row, and a team's own contracts all name it by
import { z } from "zod"

// how a Team is shown with its name, avatar and id to link
export const teamIdentity = z.object({
	teamId: z.string(),
	name: z.string(),
	// the version of its own uploaded image, or null for the initials and tint drawn from its name and id
	avatarVersion: z.string().nullable(),
})

export type TeamIdentity = z.infer<typeof teamIdentity>
