// tests how to show a failed Resend email error
import { expect, test } from "bun:test"
import { toResendErrorName } from "./email"

test("toResendErrorName reads the error name and handles a body it cannot parse", () => {
	expect(toResendErrorName('{"statusCode":422,"name":"validation_error","message":"..."}')).toBe("validation_error")
	expect(toResendErrorName('{"statusCode":500}')).toBe("an unnamed error")
	expect(toResendErrorName("<html>502 Bad Gateway</html>")).toBe("an unparsed error")
	expect(toResendErrorName("")).toBe("an unparsed error")
})
