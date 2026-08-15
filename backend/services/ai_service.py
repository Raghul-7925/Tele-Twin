"""
AI-assisted planning recommendation engine.

Analyzes coverage data, tower density, frequency allocation, and
crowdsourced measurements to provide actionable RF planning recommendations.
"""
import math
from typing import List, Dict, Optional
from ..rf.engine import haversine_km, classify_rsrp, estimate_sinr


def analyze_coverage_gaps(
    coverage_points: List[dict],
    threshold_rsrp: float = -110.0,
    cluster_radius_km: float = 2.0,
) -> List[dict]:
    """
    Identify coverage gaps (clusters of weak/no-coverage points).

    Returns a list of gap regions with center location, size, and severity.
    """
    # Find weak/no-coverage points
    weak_points = [p for p in coverage_points if p.get("predicted_rsrp", 0) < threshold_rsrp]

    if not weak_points:
        return []

    # Simple clustering: group points within cluster_radius_km
    clusters = []
    used = set()

    for i, p in enumerate(weak_points):
        if i in used:
            continue
        cluster = [p]
        used.add(i)
        for j, q in enumerate(weak_points):
            if j in used:
                continue
            dist = haversine_km(p["latitude"], p["longitude"], q["latitude"], q["longitude"])
            if dist <= cluster_radius_km:
                cluster.append(q)
                used.add(j)

        if len(cluster) >= 3:  # Minimum cluster size
            avg_lat = sum(pt["latitude"] for pt in cluster) / len(cluster)
            avg_lon = sum(pt["longitude"] for pt in cluster) / len(cluster)
            avg_rsrp = sum(pt.get("predicted_rsrp", -120) for pt in cluster) / len(cluster)
            clusters.append({
                "center_lat": round(avg_lat, 5),
                "center_lon": round(avg_lon, 5),
                "point_count": len(cluster),
                "avg_rsrp": round(avg_rsrp, 1),
                "severity": "critical" if avg_rsrp < -120 else "moderate",
                "radius_km": cluster_radius_km,
            })

    return sorted(clusters, key=lambda c: c["avg_rsrp"])


def analyze_tower_density(towers: List[dict], radius_km: float = 10.0) -> List[dict]:
    """
    Analyze tower density across the deployment area.
    Identifies over-dense and under-dense areas.
    """
    if not towers:
        return []

    density_map = []
    for t in towers:
        nearby_count = sum(
            1 for other in towers
            if t["id"] != other["id"]
            and haversine_km(t["latitude"], t["longitude"], other["latitude"], other["longitude"]) <= radius_km
        )
        density_map.append({
            "tower_id": t["id"],
            "latitude": t["latitude"],
            "longitude": t["longitude"],
            "nearby_count": nearby_count,
            "density_category": (
                "over_dense" if nearby_count > 6
                else "normal" if nearby_count > 2
                else "sparse"
            ),
        })

    return density_map


def generate_recommendations(
    towers: List[dict],
    coverage_points: List[dict],
    measurements: List[dict],
    gap_clusters: List[dict],
) -> List[dict]:
    """
    Generate AI-assisted planning recommendations.

    Analyzes the current network state and provides actionable suggestions
    for improving coverage, capacity, and network quality.
    """
    recommendations = []

    # ── 1. Coverage gap recommendations ───────────────────────────────────────
    for gap in gap_clusters:
        if gap["severity"] == "critical":
            recommendations.append({
                "category": "coverage_gap",
                "priority": "high",
                "title": f"Critical Coverage Gap Detected",
                "description": (
                    f"A coverage gap with {gap['point_count']} weak points "
                    f"(avg RSRP: {gap['avg_rsrp']:.1f} dBm) was detected "
                    f"near ({gap['center_lat']:.4f}, {gap['center_lon']:.4f})."
                ),
                "suggested_action": (
                    "Consider deploying a new site near the gap center. "
                    "700 MHz band recommended for maximum coverage area. "
                    "Alternatively, increase antenna height of the nearest tower."
                ),
                "location": {"lat": gap["center_lat"], "lon": gap["center_lon"]},
            })
        else:
            recommendations.append({
                "category": "coverage_gap",
                "priority": "medium",
                "title": "Moderate Coverage Gap",
                "description": (
                    f"An area with {gap['point_count']} below-threshold points "
                    f"(avg RSRP: {gap['avg_rsrp']:.1f} dBm) near "
                    f"({gap['center_lat']:.4f}, {gap['center_lon']:.4f})."
                ),
                "suggested_action": (
                    "Evaluate if antenna tilt adjustment on the nearest tower "
                    "can extend coverage. Consider lower-frequency band if available."
                ),
                "location": {"lat": gap["center_lat"], "lon": gap["center_lon"]},
            })

    # ── 2. Frequency optimization ─────────────────────────────────────────────
    freq_usage = {}
    for t in towers:
        op = t.get("operator_name", "Unknown")
        if op not in freq_usage:
            freq_usage[op] = set()
        freq_usage[op].add(t.get("frequency_mhz", 900))

    for op, freqs in freq_usage.items():
        if len(freqs) == 1 and 2100 in freqs:
            recommendations.append({
                "category": "frequency",
                "priority": "medium",
                "title": f"{op}: Single High-Frequency Band",
                "description": (
                    f"{op} is using only 2100 MHz. This limits coverage range."
                ),
                "suggested_action": (
                    "Consider adding 700 MHz or 900 MHz carriers for better "
                    "indoor/rural coverage. Lower frequencies propagate 2-3x further."
                ),
            })

    # ── 3. Measurement vs prediction comparison ───────────────────────────────
    if measurements and coverage_points:
        comparison_errors = []
        for m in measurements:
            m_rsrp = m.get("rsrp")
            if m_rsrp is None:
                continue
            # Find nearest prediction
            min_dist = float("inf")
            nearest_pred = None
            for p in coverage_points:
                dist = haversine_km(
                    m["latitude"], m["longitude"],
                    p["latitude"], p["longitude"]
                )
                if dist < min_dist:
                    min_dist = dist
                    nearest_pred = p

            if nearest_pred and min_dist < 0.5:  # Within 500m
                error = m_rsrp - nearest_pred.get("predicted_rsrp", 0)
                comparison_errors.append(error)

        if comparison_errors:
            mae = sum(abs(e) for e in comparison_errors) / len(comparison_errors)
            mean_error = sum(comparison_errors) / len(comparison_errors)
            rmse = math.sqrt(sum(e**2 for e in comparison_errors) / len(comparison_errors))

            if mae > 10:
                recommendations.append({
                    "category": "model_accuracy",
                    "priority": "high",
                    "title": "Large Prediction Error Detected",
                    "description": (
                        f"Mean Absolute Error between predicted and measured RSRP is "
                        f"{mae:.1f} dB (RMSE: {rmse:.1f} dB). "
                        f"This suggests the propagation model may not match the environment."
                    ),
                    "suggested_action": (
                        f"Mean error is {mean_error:+.1f} dB. "
                        "Try switching propagation model (FSPL → Okumura-Hata → COST-231). "
                        "Consider adding terrain/building obstruction data for more accurate predictions."
                    ),
                })
            elif mae > 5:
                recommendations.append({
                    "category": "model_accuracy",
                    "priority": "medium",
                    "title": "Moderate Prediction Error",
                    "description": (
                        f"MAE: {mae:.1f} dB, RMSE: {rmse:.1f} dB. "
                        f"Model predictions deviate from measurements by ~{mae:.0f} dB on average."
                    ),
                    "suggested_action": (
                        "Consider calibrating the model with a correction factor, "
                        "or switching to a more appropriate model for this environment."
                    ),
                })

    # ── 4. Interference warnings ──────────────────────────────────────────────
    if len(towers) > 1:
        for i, t1 in enumerate(towers):
            for t2 in towers[i+1:]:
                dist = haversine_km(
                    t1["latitude"], t1["longitude"],
                    t2["latitude"], t2["longitude"]
                )
                # Same operator, same frequency, close towers
                if (t1.get("operator_name") == t2.get("operator_name")
                    and dist < 2.0
                    and t1.get("frequency_mhz") == t2.get("frequency_mhz")):
                    recommendations.append({
                        "category": "interference",
                        "priority": "medium",
                        "title": "Potential Co-Channel Interference",
                        "description": (
                            f"Tower {t1.get('id')} and {t2.get('id')} are only "
                            f"{dist:.1f} km apart with same frequency "
                            f"({t1.get('frequency_mhz')} MHz) and operator."
                        ),
                        "suggested_action": (
                            "Check for overlapping coverage areas. Consider frequency "
                            "planning (different carriers) or antenna tilt adjustment "
                            "to reduce interference."
                        ),
                    })

    # ── 5. General best-practice recommendations ──────────────────────────────
    if not towers:
        recommendations.append({
            "category": "setup",
            "priority": "high",
            "title": "No Towers Configured",
            "description": "The system has no tower data loaded.",
            "suggested_action": (
                "Import tower data using CSV/JSON/GeoJSON import, "
                "or add towers manually by clicking on the map."
            ),
        })

    if not measurements:
        recommendations.append({
            "category": "data_quality",
            "priority": "low",
            "title": "No Crowdsourced Measurements",
            "description": "No field measurements available for validation.",
            "suggested_action": (
                "Import crowdsourced signal measurements to validate "
                "propagation model predictions and improve accuracy."
            ),
        })

    # Sort by priority
    priority_order = {"high": 0, "medium": 1, "low": 2}
    recommendations.sort(key=lambda r: priority_order.get(r["priority"], 3))

    return recommendations
