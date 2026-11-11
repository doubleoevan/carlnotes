// the send of a rank dialog's moves, shared by the home and profile rank dialogs of every page
import type { PinnedOrderMove } from "@carlnotes/core/lib/rankDialog"

/**
 * Sends a rank dialog's moves one at a time, in the order the person arranged them. A rejected move stops the send and
 * throws.
 */
export async function sendPinnedOrderMoves(
	pinnedOrderMoves: PinnedOrderMove[],
	sendPinnedOrder: (id: string, position: number) => Promise<unknown>,
): Promise<void> {
	for (const pinnedOrderMove of pinnedOrderMoves) {
		await sendPinnedOrder(pinnedOrderMove.id, pinnedOrderMove.position)
	}
}
