## MODIFIED Requirements

### Requirement: The map pins visitors by place

The map SHALL pin each place at its stored place, Cloudflare's coordinates or its country's center, down to the postal
code. Places that sit near each other on the screen SHALL share one pin, titled by their city if they share one.
Every pin shows its items' visits or plays summed, the same number its detail totals. A pin SHALL show no tooltip on
hover, so it never covers the pins around it.

#### Scenario: Zooming in splits a country's pin into its cities

- **WHEN** a reader zooms the map in on a country with places in two cities
- **THEN** the country's shared pin gives way to a pin for each city's places
