// every Button and Badge variant and size gives its recorded classes, compared as sets. each recorded class list is
// merged with cn before it compares
import { expect, test } from "bun:test"
import { cn } from "@carlnotes/nightshift/classNames"
import { badgeVariantNames } from "@carlnotes/nightshift/components/badge"
import { buttonSizeNames, buttonVariantNames } from "@carlnotes/nightshift/components/button"
import { renderToStaticMarkup } from "react-dom/server"
import { toElementClassNames } from "@/components/markupTestFixtures"
import { Badge, badgeVariants } from "./badge"
import { Button, buttonVariants } from "./button"
import { RECORDED_BADGE_CLASSES, RECORDED_BUTTON_CLASSES, SAMPLE_CLASS_NAME } from "./primitiveClassesTestFixtures"

// every Button variant and size pair, with and without the sample class name, and the call with no options
test("every Button variant and size gives the recorded classes", () => {
	expect(toSortedClasses(buttonVariants())).toEqual(toSortedClasses(cn(RECORDED_BUTTON_CLASSES[""])))
	for (const variant of buttonVariantNames) {
		for (const size of buttonSizeNames) {
			// compare the classes buttonVariants returns and the rendered element's classes to the recorded sets
			const recordKey = `${variant}/${size}`
			const renderedHtml = renderToStaticMarkup(<Button variant={variant} size={size} className={SAMPLE_CLASS_NAME} />)
			expect(toSortedClasses(buttonVariants({ variant, size })), recordKey).toEqual(
				toSortedClasses(cn(RECORDED_BUTTON_CLASSES[recordKey])),
			)
			expect(toSortedClasses(toElementClassNames(renderedHtml, "button")[0]), `${recordKey}/className`).toEqual(
				toSortedClasses(RECORDED_BUTTON_CLASSES[`${recordKey}/className`]),
			)
		}
	}
})

// every Badge variant, with and without the sample class name, and the call with no options
test("every Badge variant gives the recorded classes", () => {
	expect(toSortedClasses(badgeVariants())).toEqual(toSortedClasses(cn(RECORDED_BADGE_CLASSES[""])))
	for (const variant of badgeVariantNames) {
		// compare the classes badgeVariants returns and the rendered element's classes to the recorded sets
		const renderedHtml = renderToStaticMarkup(<Badge variant={variant} className={SAMPLE_CLASS_NAME} />)
		expect(toSortedClasses(badgeVariants({ variant })), variant).toEqual(
			toSortedClasses(cn(RECORDED_BADGE_CLASSES[variant])),
		)
		expect(toSortedClasses(toElementClassNames(renderedHtml, "span")[0]), `${variant}/className`).toEqual(
			toSortedClasses(RECORDED_BADGE_CLASSES[`${variant}/className`]),
		)
	}
})

// split a class string into its distinct classes, sorted
function toSortedClasses(className: string | undefined): string[] {
	return [...new Set((className ?? "").split(/\s+/).filter(Boolean))].sort()
}
