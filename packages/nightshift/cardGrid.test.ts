// the card section count rule: right after the title while a row of cards ends short of the far right
import { expect, test } from "bun:test"
import { toCountBesideTitleFrom } from "./cardGrid"

test("the count sits beside the title from the width where the cards stop filling a row", () => {
	expect(toCountBesideTitleFrom(1)).toBe("sm")
	expect(toCountBesideTitleFrom(2)).toBe("lg")
	expect(toCountBesideTitleFrom(3)).toBeUndefined()
	expect(toCountBesideTitleFrom(8)).toBeUndefined()
})
