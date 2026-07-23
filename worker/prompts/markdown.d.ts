// Bun loads Markdown imported with { type: "text" } as its raw string contents. this declares that shape for tsc
declare module "*.md" {
	// the file's raw text
	const text: string
	export default text
}
