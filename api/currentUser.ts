// the single place that resolves the current user until Better Auth lands. every per-user query goes through here
import { DEV_USER_ID } from "../db/devUser"

// returns a fixed dev user for now. swapping the body for the Better Auth session lookup leaves callers unchanged
export function currentUser(): string {
	return DEV_USER_ID
}
