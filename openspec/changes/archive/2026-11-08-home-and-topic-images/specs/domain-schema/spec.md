# Spec Delta

## ADDED Requirements

### Requirement: Topic images and their renders are persisted

The schema SHALL hold `topic_images`, one row per Topic keyed by the Topic, with the content hash, the origin
(generated or uploaded), the scene, the model, the width and height, and the creation time, and `topic_image_renders`,
one row per model call, with the Topic, the user or null for the platform, the kind, the model, the status, the cost,
the scene, and the start and finish times.

#### Scenario: The regeneration count reads the render rows

- **WHEN** an owner has two `regenerate` rows this UTC month
- **THEN** the count the editor shows is two

#### Scenario: A render row names its kind

- **WHEN** the backfill renders a Topic
- **THEN** the render row's kind is `backfill` and its user is null

### Requirement: A Topic's image rows and objects follow the Topic

Deleting a Topic SHALL cascade to its `topic_images` and `topic_image_renders` rows and schedule its image objects for
deletion. `podcast_episodes` SHALL gain a nullable `feature_order`, released when the Podcast Episode is removed.

#### Scenario: A Topic's image rows follow the Topic

- **WHEN** a Topic with an image and three renders is deleted
- **THEN** its image row and render rows are gone and its seven objects are scheduled for deletion
