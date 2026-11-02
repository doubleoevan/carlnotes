// fixtures for the structural relationships Biome does not enforce
import { expect, test } from "bun:test"
import { componentExclusion, validateComponentPaths } from "./componentConventionFiles"
import { checkComponentConventions } from "./componentConventions"

// each supported export shape resolves one stable module-level component
const PASSING_COMPONENTS = [
	"export function FeatureCard() { return <div /> }",
	"export type FeatureCard = {label: string}; export function FeatureCard() { return <div /> }",
	"export default function FeatureCard() { return <div /> }",
	"function FeatureCard() { return <div /> }; export { FeatureCard }",
	"function FeatureCard() { return <div /> }; export { FeatureCard as default }",
	"export function FeatureCard() { return <div /> }; export default FeatureCard",
	"function Card() { return <div /> }; export { Card as FeatureCard }",
	"export const FeatureCard = <T,>({value}: {value: T}) => <div>{String(value)}</div>",
	'import {memo} from "react"; export const FeatureCard = memo(function Body() { return <div /> })',
	'import {memo as remember} from "react"; export const FeatureCard = remember(() => <div />)',
	'import React from "react"; export const FeatureCard = React.memo(() => <div />)',
	'import {forwardRef} from "react"; export const FeatureCard = forwardRef<HTMLDivElement, {label: string}>((props, ref) => <div ref={ref}>{props.label}</div>)',
	'import {memo} from "react"; function FeatureCard() { return <div /> }; export default memo(FeatureCard)',
	"export const FeatureCard = (() => <div />) satisfies React.FC",
	"export function FeatureCard() { return null }",
	'import {createElement as element} from "react"; export function FeatureCard() { return element("div") }',
	"type FeatureCardProps = {label: string}; export function FeatureCard(props: FeatureCardProps) { return <div>{props.label}</div> }",
	"interface FeatureCardProps { label: string }; export function FeatureCard(props: FeatureCardProps) { return <div /> }",
	'import type {PaginationState} from "./shared"; export function FeatureCard(props: PaginationState) { return <div /> }',
	'import type {SharedProps} from "./shared"; export function FeatureCard(props: SharedProps & {label: string}) { return <div /> }',
	'import type {SharedProps} from "./shared"; export function FeatureCard(props: Pick<SharedProps, "label">) { return <div /> }',
	'type Model = "open" | "closed"; export type FeatureCardElements = {Text: unknown}; type FeatureCardProps = {model: Model}; export function FeatureCard(props: FeatureCardProps) { return <div /> }',
	'const LABEL = "label"; type HelperOptions = {label: string}; function label(options: HelperOptions) { return options.label }; function Row() { return <span>{label({label: LABEL})}</span> }; export function FeatureCard() { return <Row /> }',
	'// export function Fake() {}\nconst TEXT = "export function Fake() {}"; export function FeatureCard() { return <div>{TEXT}</div> }',
]

for (const fileText of PASSING_COMPONENTS) {
	test(`accepts ${fileText.slice(0, 95)}`, () => {
		const analysis = checkComponentConventions({ filePath: "FeatureCard.tsx", fileText })
		expect(analysis.classification).toBe("checked")
		expect(analysis.primaryName).toBe("FeatureCard")
		expect(analysis.diagnostics).toEqual([])
	})
}

// failures identify the owning declaration and keep stable diagnostic categories
const FAILING_COMPONENTS = [
	{ rule: "primary-count", text: "export type OnlyType = string" },
	{
		rule: "primary-count",
		text: "export function FeatureCard() { return <div /> }; export function Row() { return <span /> }",
	},
	{ rule: "primary-name", text: "export function OtherCard() { return <div /> }" },
	{ rule: "primary-name", text: "export type FeatureCard = string; export function OtherCard() { return <div /> }" },
	{ rule: "primary-name", text: "export default () => <div />" },
	{
		rule: "props-name",
		text: "type Props = {label: string}; export function FeatureCard(props: Props) { return <div /> }",
	},
	{
		rule: "props-name",
		text: "type OtherProps = {label: string}; export function FeatureCard<T>(props: OtherProps) { return <div /> }",
	},
	{
		rule: "props-name",
		text: 'import {memo} from "react"; type Props = {label: string}; export const FeatureCard = memo<Props>(() => <div />)',
	},
	{
		rule: "props-name",
		text: 'import {forwardRef} from "react"; type Props = {label: string}; export const FeatureCard = forwardRef<HTMLElement, Props>(() => <div />)',
	},
	{
		rule: "props-name",
		text: "type Props = {label: string}; export const FeatureCard: React.FC<Props> = () => <div />",
	},
	{
		rule: "props-name",
		text: 'type Props = {label: string}; function Row(props: Props) { return <span /> }; export function FeatureCard() { return <Row label="a" /> }',
	},
]

for (const { rule, text } of FAILING_COMPONENTS) {
	test(`reports ${rule}: ${text.slice(0, 90)}`, () => {
		const analysis = checkComponentConventions({ filePath: "FeatureCard.tsx", fileText: text })
		const diagnostic = analysis.diagnostics.find((finding) => finding.rule === `component/${rule}`)
		// identify the violation and its source location
		expect(diagnostic).toBeDefined()
		expect(diagnostic?.line).toBeGreaterThanOrEqual(1)
		expect(diagnostic?.column).toBeGreaterThanOrEqual(1)
	})
}

// require review for opaque wrappers and external identities
test("requires review for opaque runtime exports and fails on malformed TSX", () => {
	for (const fileText of [
		"export const FeatureCard = enhance(() => <div />)",
		'export { FeatureCard } from "./shared"',
		'export * from "./shared"',
	]) {
		const analysis = checkComponentConventions({ filePath: "FeatureCard.tsx", fileText })
		expect(analysis.classification).toBe("review")
		expect(analysis.diagnostics[0]?.rule).toBe("component/review")
	}
	expect(() => checkComponentConventions({ filePath: "FeatureCard.tsx", fileText: "export function {" })).toThrow()
})

// report props once when named and default exports share an identity
test("reports one props finding for a component exported by name and as default", () => {
	const fileText =
		"type Props = {}; export function FeatureCard(props: Props) { return <div /> }; export default FeatureCard"
	const analysis = checkComponentConventions({ filePath: "FeatureCard.tsx", fileText })
	expect(analysis.diagnostics.map((finding) => finding.rule)).toEqual(["component/props-name"])
})

// allow type-only exports beside the primary component
test("ignores type-only local export lists", () => {
	const fileText = "type Shared = string; export { type Shared }; export function FeatureCard() { return <div /> }"
	expect(checkComponentConventions({ filePath: "FeatureCard.tsx", fileText }).diagnostics).toEqual([])
})

// framework and non-production files retain their own module conventions
test("classifies exclusions without treating the primitives folder as an exception", () => {
	const excluded = [
		"apps/web/src/routes/a.tsx",
		"apps/mobile/app/index.tsx",
		"apps/web/src/client.tsx",
		"apps/web/src/components/common/Card.stories.tsx",
		"apps/web/src/components/common/Card.test.tsx",
		"apps/web/src/components/common/Card.spec.tsx",
		"apps/web/src/components/common/cardTestFixtures.tsx",
		"apps/web/src/components/__fixtures__/Card.tsx",
		"apps/web/src/components/common/Card.generated.tsx",
		"apps/web/src/routeTree.gen.ts",
		"apps/web/src/components/generated/Card.tsx",
	]
	for (const filePath of excluded) {
		expect(componentExclusion(filePath, [])).not.toBeNull()
	}
	// require an exact designation for a primitive exception
	const filePath = "apps/web/src/components/primitives/FeatureCard.tsx"
	expect(componentExclusion(filePath, [])).toBeNull()
	expect(componentExclusion(filePath, [{ filePath, reason: "compound fixture" }])).toBe("compound fixture")
})

// reject stale or ambiguous path designations
test("rejects missing paths, duplicate designations, and empty reasons", () => {
	const entry = { filePath: "package.json", reason: "fixture" }
	expect(() => validateComponentPaths([entry, entry])).toThrow()
	expect(() => validateComponentPaths([{ ...entry, reason: " " }])).toThrow()
	expect(() => validateComponentPaths([{ ...entry, filePath: "missing-component.tsx" }])).toThrow()
})
