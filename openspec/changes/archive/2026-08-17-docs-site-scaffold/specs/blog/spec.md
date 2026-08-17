## ADDED Requirements

### Requirement: Blog pages are server-rendered markdown

`GET /blog` SHALL list the blog's pages, and `GET /blog/:slug` SHALL render one, both as server-rendered HTML readable without JS execution. Pages SHALL be markdown files under `content/blog/` with a frontmatter block naming title, description, and date, the slug taken from the filename. Each page SHALL carry its own title, description, canonical URL, and `BlogPosting` JSON-LD. A slug matching no file SHALL answer 404.

The blog SHALL be the only surface this renderer serves. Documentation is served by the docs site, as `docs-site` requires.

#### Scenario: A post renders without JS

- **WHEN** a crawler fetches `/blog/<slug>` with scripts off
- **THEN** the post's full HTML content, title, canonical url, and JSON-LD are in the response

#### Scenario: The index lists the posts

- **WHEN** a reader opens `/blog`
- **THEN** every post lists with its title, description, and date, newest first

#### Scenario: An unknown slug is not found

- **WHEN** a request names a slug with no matching file
- **THEN** the route answers 404

#### Scenario: The renderer serves no docs

- **WHEN** the markdown renderer's routes are inspected
- **THEN** it answers only `/blog` paths, and `content/docs/` no longer exists

## REMOVED Requirements

### Requirement: Blog and docs pages are server-rendered markdown

**Reason**: The docs half moves to the Starlight site, which owns `/docs` along with its sidebar, navigation, and search. The blog half is unchanged and continues under the requirement that replaces this one.

**Migration**: `/docs` and `/docs/:slug` are answered by the docs static handler instead of this renderer, and the three pages in `content/docs/` are replaced by the docs written in the Starlight project, with their urls redirecting to the docs landing page. Docs pages no longer carry `Article` JSON-LD; Starlight emits its own head tags. Blog behavior is unaffected.
