

## Multi-operator tower workflow

A tower is the physical site; each operator/technology/band combination is stored as a separate **cell** under that tower. For example, one site can contain Airtel 4G B3, Airtel 4G B1, Jio 5G n78, and Vi 4G B8. In the Towers tab, select a tower under **Radio inventory**, choose the operator, technology, band, and azimuth, then add the radio. Each listed radio has its own **Simulate** action, so its frequency, power, antenna gain, and sector direction are evaluated independently on the GIS map.

## Dense-region map rendering

Real tower sites from dense datasets such as Chennai are now fetched with a bounded initial payload and rendered as lightweight Canvas circles. The map no longer creates an animated DOM icon for every site. The API keeps the full feature count for reference, while `limit=0` remains available for export or analysis workflows that need all features.
