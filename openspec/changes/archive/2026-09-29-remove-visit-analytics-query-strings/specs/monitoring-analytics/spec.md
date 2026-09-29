## MODIFIED Requirements

### Requirement: Visit analytics run in the browser

When the browser analytics key is set, the app SHALL send PostHog one page view per page opened, a page leave when
that page closes, and the page's web vitals, and nothing else. It SHALL NOT enable autocapture, and SHALL NOT enable session recording, so no
click, keystroke, form value, scroll, or recording is ever collected. The page leave is what gives a session its exit
page and its duration, and collects nothing the page view did not. A page view SHALL include the page's path, its referrer, and what
PostHog's own client reads from the browser, such as the user agent and the screen size. It SHALL NOT include
anything the user typed.

Because the app is one page under a router, a page view SHALL be captured on every route change and not only on the
first load, so a visit that reads four pages reports four views.

The web vitals SHALL be largest contentful paint, interaction to next paint, cumulative layout shift, and first
contentful paint, captured by PostHog's own web vitals capture with attribution off, so no element selector and no
resource url is sent. The web vitals code SHALL load from the app's own build after the client starts, and no script
SHALL load from PostHog's asset host.

A path that includes an identifier SHALL be reported as its route's shape rather than its literal value, so
`/topics/<id>` reports as one page instead of one row per Topic, and no Topic, profile, or invite id is attached to a
visitor who never signed in. That rewrite SHALL run on every event as it is sent, and on every path and every url the event includes, top-level
or inside a web vitals metric, including the previous page's path that the client attaches to a page view and a page
leave, since the url repeats the path and the page leave and the web vitals are captured by the client rather than by
the app.

No url an event includes SHALL keep its query string or its fragment. Each url SHALL be reported as its origin and its
route-shaped path, top-level or inside a web vitals metric, since a password reset token, an unsubscribe token, or a
consent code can travel in a page's address, and a referrer repeats the address of the page before. The campaign
parameters and click ids that PostHog's client records as properties of their own, such as `utm_source` and `gclid`,
SHALL stay, so attribution is unchanged.

#### Scenario: A visit to a public page is counted
- **WHEN** a signed-out visitor opens a public Topic page
- **THEN** one page view is sent, carrying the route's shape and the referrer, and no click or input is collected

#### Scenario: Reading several pages reports several views
- **WHEN** a visitor moves from the home page to a Topic and then to a profile without reloading
- **THEN** three page views are sent, one per route change

#### Scenario: An id in the path is not reported
- **WHEN** a visitor opens `/topics/<id>`
- **THEN** the view reports the route's shape, and the Topic's id appears in no property

#### Scenario: The page leave is rewritten too
- **WHEN** the visitor leaves `/topics/<id>` and the client sends its own page leave
- **THEN** that event's path and url both report the route's shape, since the rewrite runs on the way out and not at
  the one call the app makes

#### Scenario: Nothing inside the page is captured
- **WHEN** a visitor clicks buttons, types into the composer, and scrolls
- **THEN** no event is sent for any of it, and no session is recorded

#### Scenario: Web vitals report the route's shape
- **WHEN** a visitor opens `/topics/<id>` and the page's web vitals are sent
- **THEN** the event's url and each metric's url report the route's shape, and the Topic's id appears in no property

#### Scenario: Web vitals load from the app
- **WHEN** the analytics client starts
- **THEN** the web vitals code arrives as a chunk from the app's own origin, and no script loads from PostHog's asset host

#### Scenario: The previous page's path is rewritten too
- **WHEN** a visitor moves from `/topics/<id>` to a profile, and the client attaches the previous page's path to the view
- **THEN** that path reports `/topics/:id`, and the Topic's id appears in no property

#### Scenario: A reset token never reaches PostHog
- **WHEN** a visitor opens the reset password page with `?token=<token>` in its address
- **THEN** every url the page view and the page leave include ends at the page's path, and the token appears in no
  property

#### Scenario: A referrer's query string is dropped
- **WHEN** a visitor arrives from another site whose address has a query string
- **THEN** the page view's referrer is that site's origin and path, with no query string

#### Scenario: Campaign attribution stays
- **WHEN** a visitor arrives from a link with `?utm_source=newsletter&gclid=<id>`
- **THEN** the page view's url has no query string, and `utm_source` and `gclid` arrive as properties of their own
