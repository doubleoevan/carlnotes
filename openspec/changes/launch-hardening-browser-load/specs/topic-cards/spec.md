## MODIFIED Requirements

### Requirement: One image component picks the file for its size

A shared `TopicImage` component SHALL take a Topic's image urls and a `TopicImageSize` and draw the 1x and 2x files for
that size, with the placeholder ground until the file loads and when no image exists. The web SHALL offer both
densities, the mobile app SHALL load the 2x file on every device, and no copy of the component SHALL exist per app.
The component SHALL take a priority option. With the option the web SHALL load the image eagerly at high fetch
priority and the mobile app SHALL load it at high priority. Without it the web SHALL load the image lazily and decode
it off the main thread. The `page-load` capability states which images take the option.

#### Scenario: A retina browser gets the 2x file

- **WHEN** a 2x display shows a Topic card
- **THEN** the browser loads the `page@2x` file

#### Scenario: A Topic with no image shows the ground

- **WHEN** a Topic's image has not rendered
- **THEN** the component draws the placeholder ground at the size's aspect box

#### Scenario: A priority image loads eagerly

- **WHEN** a page draws its header image with the priority option
- **THEN** the web's image loads eagerly at high fetch priority, and the mobile app's image loads at high priority

#### Scenario: An image without the option is lazy

- **WHEN** a card below the first row draws its image without the option
- **THEN** the web's image loads lazily with asynchronous decoding
