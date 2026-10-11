// the session helper the api tests share: answer the session lookup as one user or as a visitor. only tests import it
import { spyOn } from "bun:test"
import { auth } from "./auth"

/**
 * Answers every session lookup as the given user, or as a signed-out visitor for null, until the spies are restored.
 */
export function signInAs(userId: string | null): void {
	spyOn(auth.api, "getSession").mockResolvedValue(
		userId ? ({ user: { id: userId }, session: { id: `session-${userId}` } } as never) : null,
	)
}
