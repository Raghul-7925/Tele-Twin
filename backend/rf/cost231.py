"""
COST-231 Hata propagation model.

Extension of Okumura-Hata for higher frequencies (1500-2000 MHz).
Developed by the European COST (European Cooperation in Science and Technology)
Action 231.

Valid for:
  - Frequency: 1500-2000 MHz
  - Base station height: 30-200 m
  - Mobile height: 1-10 m
  - Distance: 1-20 km

Reference: "Digital Mobile Radio: COST 231 View on the Evolution towards 3rd
Generation Systems", COST 231 Final Report, 1999.
"""
import math


def calculate_cost231(
    frequency_mhz: float,
    base_height_m: float,
    mobile_height_m: float,
    distance_km: float,
    environment: str = "urban",
) -> float:
    """
    Calculate path loss using COST-231 Hata model.

    Parameters
    ----------
    frequency_mhz : float
        Frequency in MHz (1500-2000)
    base_height_m : float
        Base station antenna height in m (30-200)
    mobile_height_m : float
        Mobile antenna height in m (1-10)
    distance_km : float
        Distance in km (1-20)
    environment : str
        'urban' or 'suburban' (rural uses suburban correction)

    Returns
    -------
    float
        Path loss in dB
    """
    if distance_km < 1.0:
        distance_km = 1.0

    # Mobile antenna correction (same form as Okumura-Hata for medium cities)
    a_hm = (1.1 * math.log10(frequency_mhz) - 0.7) * mobile_height_m - (
        1.56 * math.log10(frequency_mhz) - 0.8
    )

    # COST-231 formula (extends Okumura-Hata with frequency factor C)
    # C = 0 dB for medium-sized cities and suburban areas
    # C = 3 dB for metropolitan areas
    C = 3.0 if environment == "urban" else 0.0

    L = (
        46.3
        + 33.9 * math.log10(frequency_mhz)
        - 13.82 * math.log10(base_height_m)
        - a_hm
        + (44.9 - 6.55 * math.log10(base_height_m)) * math.log10(distance_km)
        + C
    )

    return L


def validate_cost231(
    frequency_mhz: float,
    base_height_m: float,
    mobile_height_m: float,
    distance_km: float,
) -> dict:
    """
    Validate parameters against COST-231 validity range.

    Returns
    -------
    dict with 'valid', 'warnings', 'model', 'reference', 'applicability'
    """
    warnings = []
    valid = True

    if frequency_mhz < 1500 or frequency_mhz > 2000:
        warnings.append(
            f"Frequency {frequency_mhz:.0f} MHz outside valid range (1500-2000 MHz). "
            "Results extrapolated."
        )
        if frequency_mhz > 3000:
            valid = False

    if base_height_m < 30 or base_height_m > 200:
        warnings.append(
            f"Base height {base_height_m:.0f} m outside valid range (30-200 m)."
        )

    if mobile_height_m < 1 or mobile_height_m > 10:
        warnings.append(
            f"Mobile height {mobile_height_m:.1f} m outside valid range (1-10 m)."
        )

    if distance_km < 1 or distance_km > 20:
        warnings.append(
            f"Distance {distance_km:.1f} km outside valid range (1-20 km)."
        )

    return {
        "valid": valid,
        "warnings": warnings,
        "model": "COST-231 Hata",
        "reference": "COST 231 Final Report, 1999",
        "applicability": "1500-2000 MHz, 30-200m BS height, 1-20 km distance",
    }
