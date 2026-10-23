// the spend reservation that the api tests stub: every call reserved, with a release the tests read
import { mock, spyOn } from "bun:test"
import * as spendReservations from "./spendReservations"

// the reservation the stub returns, whose release is a spy
export type SpendReservationStub = { release: ReturnType<typeof mock<() => Promise<void>>> }

/**
 * Stubs reserveUserSpend to reserve every call, and returns the reservation it returns and the spy on it.
 */
export function stubReservedUserSpend(): {
	reservation: SpendReservationStub
	reserveUserSpendSpy: ReturnType<typeof spyOn<typeof spendReservations, "reserveUserSpend">>
} {
	const reservation: SpendReservationStub = { release: mock(async () => {}) }
	return {
		reservation,
		reserveUserSpendSpy: spyOn(spendReservations, "reserveUserSpend").mockResolvedValue(reservation),
	}
}
