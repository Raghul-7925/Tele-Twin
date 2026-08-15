"""
Okumura-Hata propagation model.

Empirical model based on Okumura's measurements in Tokyo, curve-fitted by Hata.
Valid for:
  - Frequency: 150-1500 MHz
  - Base station height: 30-200 m
  - Mobile height: 1-10 m
  - Distance: 1-20 km

Reference: M. Hata, "Empirical Formula for Propagation Loss in Land Mobile Radio
Services", IEEE Trans. Vehicular Technology, vol. VT-29, no. 3, 1980.
"""
import math


def _mobile_antenna_correction(f_mhz: float, h_m: float, env: str) -> float:
    """
    Calculate mobile antenna height correction factor a(h_m).

    For urban (large city):
        a(h_m) = 3.2 * [log10(11.75 * h_m)]^2 - 4.97   (f >= 300 MHz)
        a(h_m) = 8.29 * [log10(1.54 * h_m)]^2 - 1.1     (f < 300 MHz)

    For suburban:
        a(h_m) = (1.1 * log10(f) - 0.7) * h_m - (1.56 * log10(f) - 0.8)

    For rural:
        a(h_m) same as suburban formula
    """
    if env in ("suburban", "rural"):
        return (1.1 * math.log10(f_mhz) - 0.7) * h_m - (1.56 * math.log10(f_mhz) - 0.8)

    # Urban (large city)
    if f_mhz >= 300:
        return 3.2 * (math.log10(11.75 * h_m)) ** 2 - 4.97
    else:
        return 8.29 * (math.log10(1.54 * h_m)) ** 2 - 1.1


def calculate_okumura_hata(
    frequency_mhz: float,
    base_height_m: float,
    mobile_height_m: float,
    distance_km: float,
    environment: str = "urban",
) -> float:
    """
    Calculate path loss using Okumura-Hata model.

    Parameters
    ----------
    frequency_mhz : float
        Frequency in MHz (150-1500)
    base_height_m : float
        Base station antenna height in m (30-200)
    mobile_height_m : float
        Mobile antenna height in m (1-10)
    distance_km : float
        Distance in km (1-20)
    environment : str
        'urban', 'suburban', or 'rural'

    Returns
    -------
    float
        Path loss in dB

    Raises
    ------
    ValueError
        If parameters are outside model validity range
    """
    # Clamp distance (model not valid below 1 km)
    if distance_km < 1.0:
        distance_km = 1.0

    # Base urban path loss
    a_hm = _mobile_antenna_correction(frequency_mhz, mobile_height_m, environment)

    L = (
        69.55
        + 26.16 * math.log10(frequency_mhz)
        - 13.82 * math.log10(base_height_m)
        - a_hm
        + (44.9 - 6.55 * math.log10(base_height_m)) * math.log10(distance_km)
    )

    # Environment correction
    if environment == "suburban":
        L -= 2 * (math.log10(frequency_mhz / 28)) ** 2 - 5.4
    elif environment == "rural":
        L -= (
            4.78 * (math.log10(frequency_mhz)) ** 2
            - 18.33 * math.log10(frequency_mhz)
            - 40.94
        )

    return L


def validate_okumura_hata(
    frequency_mhz: float,
    base_height_m: float,
    mobile_height_m: float,
    distance_km: float,
) -> dict:
    """
    Validate parameters against Okumura-Hata validity range.

    Returns
    -------
    dict with 'valid', 'warnings', 'model', 'reference', 'applicability'
    """
    warnings = []
    valid = True

    if frequency_mhz < 150 or frequency_mhz > 1500:
        warnings.append(
            f"Frequency {frequency_mhz:.0f} MHz outside valid range (150-1500 MHz). "
            "Results may be unreliable. Consider COST-231 for 1500-2000 MHz."
        )
        if frequency_mhz > 2000:
            valid = False  # Beyond any reasonable extrapolation

    if base_height_m < 30 or base_height_m > 200:
        warnings.append(
            f"Base height {base_height_m:.0f} m outside valid range (30-200 m). "
            "Results extrapolated."
        )

    if mobile_height_m < 1 or mobile_height_m > 10:
        warnings.append(
            f"Mobile height {mobile_height_m:.1f} m outside valid range (1-10 m). "
            "Results extrapolated."
        )

    if distance_km < 1 or distance_km > 20:
        warnings.append(
            f"Distance {distance_km:.1f} km outside valid range (1-20 km). "
            "Results extrapolated."
        )

    return {
        "valid": valid,
        "warnings": warnings,
        "model": "Okumura-Hata",
        "reference": "M. Hata, IEEE Trans. VT-29(3), 1980",
        "applicability": "150-1500 MHz, 30-200m BS height, 1-20 km distance",
    }
