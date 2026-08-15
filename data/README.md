# 📁 Data Directory

Drop GeoJSON files here to auto-display towers on the map.

## Supported Format

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [80.10, 12.90] },
      "properties": { "type": "Rooftop", "tower_id": "123", "location": "name" }
    }
  ]
}
```

## Property Fields

| Field | Values | Description |
|-------|--------|-------------|
| `type` | `Rooftop`, `Ground`, `WallMount` | Tower type |
| `tower_id` | string | Unique identifier |
| `location` | string | Location name |

## Tower Colors

- 🟢 **Ground** — Green
- 🔵 **Rooftop** — Blue
- 🩷 **WallMount** — Pink

## Adding New Data

1. Place `.json` or `.geojson` file in this folder
2. Refresh the web app — towers auto-load
3. Toggle "Real Towers" button on map to show/hide
