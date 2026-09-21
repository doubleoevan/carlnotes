// HostFavicon tests: the icon when the host has one, the globe when it has none and while the icon loads
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { HostFavicon } from "./HostFavicon"

// a stored icon renders as the image the browser caches, decorative and lazy, with the globe in place until it loads
test("a host with a favicon shows it behind the globe until it loads", () => {
	const html = renderToStaticMarkup(<HostFavicon faviconPath="/api/favicons/example.com" />)
	expect(html).toContain('src="/api/favicons/example.com"')
	expect(html).toContain('alt=""')
	expect(html).toContain('loading="lazy"')
	expect(html).toContain("invisible")
	expect(html).toContain("lucide-globe")
})

// a null faviconPath shows the globe and no image
test("a host without one shows the globe", () => {
	const html = renderToStaticMarkup(<HostFavicon faviconPath={null} />)
	expect(html).toContain("lucide-globe")
	expect(html).not.toContain("<img")
})
