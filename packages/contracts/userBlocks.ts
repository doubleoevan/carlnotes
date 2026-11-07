// the user block contracts: the users a user has blocked
import { z } from "zod"
import { profileIdentity } from "./profiles"

// one blocked user, with what a profile link shows
const userBlock = profileIdentity.omit({ userId: true }).extend({ id: z.string(), blockedAt: z.string() })

export type UserBlock = z.infer<typeof userBlock>

// the user's user block list
export const userBlocksResponse = z.object({ blockedUsers: z.array(userBlock) })
