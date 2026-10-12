// the monitoring test fixture the api, worker, and database tests share: a quiet console and error report. only tests
// import it
import { type Mock, spyOn } from "bun:test"
import * as monitoring from "./monitoring"

/**
 * Quiets the console and the error report, and returns the spy on the error report.
 */
export function quietErrorReports(): Mock<typeof monitoring.reportError> {
	spyOn(console, "error").mockImplementation(() => {})
	return spyOn(monitoring, "reportError").mockImplementation(() => {})
}
