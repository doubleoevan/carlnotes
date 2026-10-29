// the block contracts: the users a user has blocked
import { z } from "zod"

// one blocked user
export const blockedUser = z.object({ id: z.string(), username: z.string(), blockedAt: z.string() })

export type BlockedUser = z.infer<typeof blockedUser>

// the user's block list
export const blockedUsersResponse = z.object({ blockedUsers: z.array(blockedUser) })
