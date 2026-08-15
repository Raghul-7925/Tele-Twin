"""
Free Space Path Loss (FSPL) model.

The simplest RF propagation model. Assumes line-of-sight with no obstacles.
Valid for any frequency but overly optimistic in real environments.

Reference: ITU-R P.525
"""
import math


def calculate_fspl(frequency_mhz: float, distance_km: float) -> float:
    """
    Calculate Free Space Path Loss.

    Parameters
    ----------
    frequency_mhz : float
        Frequency in MHz
    distance_km : float
        Distance in km

    Returns
    -------
    float
        Path loss in dB

    Formula
    -------
    FSPL(dB) = 20*log10(d) + 20*log10(f) + 32.44
    where d in km, f in MHz
    """
    if distance_km <= 0:
        distance_km = 0.001
    if frequency_mhz <= 0:
        raise ValueError("Frequency must be positive")

    return 20 * math.log10(distance_km) + 20 * math.log10(frequency_mhz) + 32.44


def calculate_received_power(
    tx_power_dbm: float,
    tx_gain_dbi: float,
    rx_gain_dbi: float,
    frequency_mhz: float,
    distance_km: float,
) -> float:
    """
    Calculate received signal power using FSPL.

    Parameters
    ----------
    tx_power_dbm : float
        Transmit power in dBm
    tx_gain_dbi : float
        Transmit antenna gain in dBi
    rx_gain_dbi : float
        Receive antenna gain in dBi (typically 0 for mobile)
    frequency_mhz : float
        Frequency in MHz
    distance_km : float
        Distance in km

    Returns
    -------
    float
        Received power in dBm
    """
    fspl = calculate_fspl(frequency_mhz, distance_km)
    return tx_power_dbm + tx_gain_dbi + rx_gain_dbi - fspl


# ── Validation ────────────────────────────────────────────────────────────────

def validate_fspl(frequency_mhz: float, distance_km: float) -> dict:
    """
    Validate FSPL applicability and return warnings.

    Returns
    -------
    dict with 'valid' (bool), 'warnings' (list), 'model' (str)
    """
    warnings = []
    if distance_km > 100:
        warnings.append(f"Distance {distance_km:.1f} km exceeds typical FSPL range (100 km)")
    if frequency_mhz > 100000:
        warnings.append(f"Frequency {frequency_mhz:.0f} MHz is in mmWave range; FSPL is very high")
    if distance_km < 0.01:
        warnings.append("Distance < 10m; near-field effects not modeled by FSPL")

    return {
        "valid": True,  # FSPL is always mathematically valid
        "warnings": warnings,
        "model": "Free Space Path Loss (FSPL)",
        "reference": "ITU-R P.525",
        "applicability": "Line-of-sight, no obstacles, any frequency",
    }
