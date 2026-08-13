# blog Specification

## Purpose
TBD - created by archiving change close-seo-gaps. Update Purpose after archive.
## Requirements
### Requirement: Blog and docs pages are server-rendered markdown

`GET /blog` and `GET /docs` SHALL each list their surface's pages, and `GET /blog/:slug` and `GET /docs/:slug` SHALL render one, all as server-rendered HTML readable without JS execution. Pages SHALL be markdown files under `content/blog/` and `content/docs/` with a frontmatter block naming title, description, and date, the slug taken from the filename. Each page SHALL carry its own title, description, canonical URL, and JSON-LD — `BlogPosting` on the blog, `Article` on docs. A slug matching no file SHALL answer 404.

#### Scenario: A post renders without JS

- **WHEN** a crawler fetches `/blog/<slug>` with scripts off
- **THEN** the post's full HTML content, title, canonical url, and JSON-LD are in the response

#### Scenario: The index lists the posts

- **WHEN** a reader opens `/blog`
- **THEN** every post lists with its title, description, and date, newest first

#### Scenario: An unknown slug is not found

- **WHEN** a request names a slug with no matching file
- **THEN** the route answers 404

