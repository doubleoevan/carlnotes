/**
 * The MCP view's HEIC decoder, which rejects every file, so the MCP view's script holds no HEIC decoder. A HEIC file
 * the browser cannot decode fails as any unreadable image does.
 */
export async function heicTo(): Promise<never> {
	throw new Error("This image format can't be read here.")
}
