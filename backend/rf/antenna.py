"""
Antenna pattern calculations.

Implements:
- EIRP calculation
- Horizontal antenna pattern (3GPP TR 25.996 style)
- Vertical antenna pattern with electrical/mechanical tilt
- Combined 2D antenna gain pattern

These calculations determine how antenna directivity affects
signal strength at different azimuths and elevation angles.
"""
import math


def calculate_eirp(power_dbm: float, gain_dbi: float, losses_db: float = 0.0) -> float:
    """
    Calculate Effective Isotropic Radiated Power.

    Parameters
    ----------
    power_dbm : float
        Transmit power in dBm
    gain_dbi : float
        Antenna gain in dBi
    losses_db : float
        Cable and connector losses in dB

    Returns
    -------
    float
        EIRP in dBm
    """
    return power_dbm + gain_dbi - losses_db


def horizontal_pattern_gain(
    azimuth_diff: float,
    horizontal_beamwidth: float,
    front_to_back_ratio: float = 25.0,
) -> float:
    """
    Calculate horizontal antenna pattern gain reduction.

    Uses a simplified 3GPP-style pattern:
        A_H(phi) = -min(12*(phi/phi_3dB)^2, A_m)

    where phi is the angle off boresight, phi_3dB is the 3dB beamwidth,
    and A_m is the front-to-back ratio.

    Parameters
    ----------
    azimuth_diff : float
        Angle difference from antenna boresight in degrees (0-180)
    horizontal_beamwidth : float
        3dB horizontal beamwidth in degrees
    front_to_back_ratio : float
        Front-to-back ratio in dB

    Returns
    -------
    float
        Gain reduction in dB (negative value)
    """
    # Normalize angle to 0-180
    phi = abs(azimuth_diff) % 360
    if phi > 180:
        phi = 360 - phi

    if horizontal_beamwidth <= 0:
        return 0.0

    # 3GPP pattern
    phi_3dB = horizontal_beamwidth / 2.0
    if phi_3dB == 0:
        return 0.0

    a_h = -min(12 * (phi / horizontal_beamwidth) ** 2, front_to_back_ratio)
    return a_h


def vertical_pattern_gain(
    elevation_diff: float,
    vertical_beamwidth: float,
    electrical_tilt: float = 0.0,
    mechanical_tilt: float = 0.0,
    max_attenuation: float = 20.0,
) -> float:
    """
    Calculate vertical antenna pattern gain reduction.

    Accounts for electrical downtilt and mechanical downtilt.

    Parameters
    ----------
    elevation_diff : float
        Elevation angle difference from horizontal in degrees
    vertical_beamwidth : float
        3dB vertical beamwidth in degrees
    electrical_tilt : float
        Electrical downtilt in degrees
    mechanical_tilt : float
        Mechanical downtilt in degrees
    max_attenuation : float
        Maximum vertical attenuation in dB

    Returns
    -------
    float
        Gain reduction in dB (negative value)
    """
    total_tilt = electrical_tilt + mechanical_tilt
    theta = elevation_diff - total_tilt

    if vertical_beamwidth <= 0:
        return 0.0

    a_v = -min(12 * ((theta) / vertical_beamwidth) ** 2, max_attenuation)
    return a_v


def calculate_3d_antenna_gain(
    azimuth_diff: float,
    elevation_angle: float,
    max_gain_dbi: float,
    horizontal_beamwidth: float = 65.0,
    vertical_beamwidth: float = 7.0,
    electrical_tilt: float = 0.0,
    mechanical_tilt: float = 0.0,
    front_to_back_ratio: float = 25.0,
) -> float:
    """
    Calculate combined 3D antenna gain.

    Combines horizontal and vertical patterns using the approximate
    3GPP method:
        A(azimuth, elevation) = max(A_H + A_V, -max_attenuation)
        Gain = max_gain + A(azimuth, elevation)

    Parameters
    ----------
    azimuth_diff : float
        Horizontal angle off boresight in degrees
    elevation_angle : float
        Elevation angle from horizontal in degrees
    max_gain_dbi : float
        Maximum antenna gain in dBi
    horizontal_beamwidth : float
        3dB horizontal beamwidth in degrees
    vertical_beamwidth : float
        3dB vertical beamwidth in degrees
    electrical_tilt : float
        Electrical downtilt in degrees
    mechanical_tilt : float
        Mechanical downtilt in degrees
    front_to_back_ratio : float
        Front-to-back ratio in dB

    Returns
    -------
    float
        Effective antenna gain in dBi at the specified direction
    """
    a_h = horizontal_pattern_gain(azimuth_diff, horizontal_beamwidth, front_to_back_ratio)
    a_v = vertical_pattern_gain(
        elevation_angle, vertical_beamwidth, electrical_tilt, mechanical_tilt
    )

    # Combined attenuation (3GPP approximation)
    a_combined = max(a_h + a_v, -30.0)

    return max_gain_dbi + a_combined


def calculate_elevation_angle(
    tower_height_m: float,
    point_height_m: float,
    distance_km: float,
) -> float:
    """
    Calculate elevation angle from tower to a ground point.

    Parameters
    ----------
    tower_height_m : float
        Tower antenna height in m
    point_height_m : float
        Point height in m (0 for ground level)
    distance_km : float
        Horizontal distance in km

    Returns
    -------
    float
        Elevation angle in degrees (positive = below horizon)
    """
    if distance_km <= 0:
        return 0.0
    height_diff = tower_height_m - point_height_m
    distance_m = distance_km * 1000
    angle_rad = math.atan2(height_diff, distance_m)
    return math.degrees(angle_rad)


def calculate_timing_advance(distance_km: float, technology: str = "4G") -> float:
    """
    Estimate Timing Advance from distance.

    TA relates to the round-trip propagation delay.
    TA unit depends on technology:
        2G (GSM): 1 TA unit ≈ 554 m → TA = distance / 0.554
        4G (LTE): 1 TA unit ≈ 48.9 m → TA = distance / 0.0489
        5G (NR):  similar to LTE

    This is an ESTIMATE, not an actual modem measurement.

    Returns
    -------
    float
        Estimated TA in units, or None if technology not supported
    """
    distance_m = distance_km * 1000
    if technology in ("4G", "5G"):
        return round(distance_m / 48.9, 1)
    elif technology in ("3G",):
        # 3G uses different timing; return chip-based estimate
        return None
    elif technology in ("2G",):
        return round(distance_m / 554.0, 1)
    return None
