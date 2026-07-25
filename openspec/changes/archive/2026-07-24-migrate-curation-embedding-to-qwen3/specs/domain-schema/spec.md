## MODIFIED Requirements

### Requirement: Resource carries an optional vector embedding and its model

A Resource SHALL have a nullable pgvector `embedding` column of 1024 dimensions and a nullable `embedding_model` column recording the vector space — the model and its dimension — that produced it. Both are null at ingestion and populated when the pipeline embeds the Resource. A model swap at the same dimension SHALL remain a backfill; a change to the embedding dimension SHALL be a schema migration that nulls the column before the `ALTER`, plus a re-embed backfill, since stored vectors of the old width cannot cast in place.

#### Scenario: Ingestion inserts before embedding
- **WHEN** a resource is first ingested by an adapter
- **THEN** the row is valid with `embedding` and `embedding_model` null

#### Scenario: Embedding and its provenance are stored
- **WHEN** the pipeline embeds a resource
- **THEN** the row stores a 1024-dimension vector `embedding` and the `embedding_model` string identifying the model and dimension that produced it

#### Scenario: A dimension change is a migration plus a backfill
- **WHEN** the embedding model's dimension changes
- **THEN** a schema migration nulls `embedding` and `embedding_model` and alters the column to the new dimension, and a backfill re-embeds the existing Resources
