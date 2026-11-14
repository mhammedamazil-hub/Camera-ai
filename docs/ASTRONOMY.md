# ASTRONOMY

**Status:** solar geometry and orbital mechanics **implemented**;
ephemerides **not implemented**.

---

## 1. Principle

Astronomy enters the simulation to answer one question: **where is the Sun?**
That fixes the terminator, the day/night cycle and the seasonal cycle, which
together determine the energy input to every surface process.

The module therefore implements *solar geometry* (declination, hour angle,
elevation, subsolar point) and *orbital mechanics* (Kepler propagation,
orbital elements). It does **not** implement ephemerides.

## 2. What is implemented

| Quantity | Where | Validated |
|---|---|---|
| Orbital propagation (Kepler, universal variables) | `gravity.js` | 2e−15 over 1 period |
| Classical orbital elements ↔ state vectors | `gravity.js` | round trip < 1e−12 |
| Escape and circular speeds | `gravity.js` | 3e−5 |
| Hill radius / sphere of influence | `gravity.js` | — |
| Solar declination | `fields.js` | ±1.5° at equinoxes, ±23.45° at solstices |
| Solar elevation angle | `fields.js` | 90° at the subsolar point at local noon |
| Subsolar point / sun direction | `fields.js` | unit vector to 1e−9 |
| Obliquity (23.439291111°) | `constants.js` | IAU 2006 |
| Precession period (25 771.575 yr) | `constants.js` | — |

## 3. Solar declination

```
δ = 23.45° · sin( 360/365 · (284 + n) )
```

where n is the day of year (Cooper 1969). The formula's error is ≤ 1°.

**What a 1° declination error means.** It displaces the subsolar latitude by
1°, i.e. **111 km of ground distance** — six times the 18.6 km DEM cell
size. So it is *not* negligible at the grid scale, even though it is
invisible on a globe. Near noon the resulting error in cos(zenith) is about
0.3%.

Measured values from the implementation:

| Day | Meaning | Declination |
|---|---|---|
| 80 | ~21 March | −0.40° |
| 172 | ~21 June | +23.45° |
| 264 | ~21 September | −0.20° |
| 355 | ~21 December | −23.45° |

The exact ephemeris was not implemented because nothing in the *current*
model integrates a radiation budget in time. If one is added, this must be
replaced with a proper solar position algorithm (NOAA SPA, or Meeus
chapter 25).

## 4. Solar elevation

```
sin(elev) = sin φ sin δ + cos φ cos δ cos H
H = (UT − 12)·15° + λ
```

Validation:

| Test | Result |
|---|---|
| June solstice, 23.45°N, 12 UT | **90.00°** (Sun directly overhead) |
| June solstice, 23.45°N, 0 UT | **−43.10°** |
| Bounded to [−90°, 90°] everywhere | passes over a 15° × 3 h sweep |
| Sun direction is a unit vector | 1e−9 |

## 5. Earth's orbital and rotational elements

| Quantity | Value | Source |
|---|---|---|
| Semi-major axis | 1.495978707e11 m | IAU 2012 |
| Eccentricity | 0.0167086 | — |
| Obliquity (J2000) | 23.439291111° | IAU 2006 |
| Sidereal day | 86 164.0905 s | IERS 2010 |
| Solar day | 86 400 s | definition |
| Rotation rate | 7.292115e−5 rad/s | IERS 2010 |
| Orbital period | 365.256 d (sidereal) | — |
| Precession period | 25 771.575 yr | — |

**Note on the rotation rate.** The sidereal day is 3.93 minutes shorter
than the solar day because the Earth must turn an extra ~1° to bring the Sun
back to the same meridian. The renderer uses the sidereal rate for the
terminator, which is why the terminator moves at 15.041°/h rather than
15.000°/h.

## 6. Assumptions and computational cost

**Assumptions.**

1. **Circular-orbit insolation.** Declination is computed from day-of-year
   only; the 1.7% eccentricity modulation of distance is not applied to
   irradiance.
2. **Constant obliquity.** 23.439291111° (J2000). The 26 000-year precession
   cycle is a constant in `constants.js`, not a state variable.
3. **Constant TSI.** 1361 W/m², no 11-year cycle (±0.1%).
4. **No Moon ephemeris.** Tidal forcing uses a time-averaged equilibrium
   amplitude, not the lunar position.
5. **No relativistic corrections.** ~1e−9 at the surface.

**Computational cost.**

| Operation | Cost |
|---|---|
| `solarDeclination` | ~40 ns (one sin) |
| `solarElevation` | ~90 ns |
| `sunDirection` | ~70 ns |
| `keplerPropagate` | ~1.2 μs |

Astronomy is never a bottleneck: it is evaluated once per frame for the
renderer, and per-sample only in the future radiation model.

## 7. What is not implemented

| Not implemented | Consequence |
|---|---|
| **Ephemerides** (Sun, Moon, planets) | No planetary positions; no eclipse prediction |
| **Lunar theory** | Tides use a time-averaged equilibrium amplitude, not the true lunar position |
| **Precession/nutation applied to the model** | Obliquity is a constant; the 26 000-year cycle is not simulated |
| **Milankovitch forcing** | Eccentricity, obliquity and precession are not driven through time |
| **Relativistic corrections** | ~1e−9 at Earth's surface; irrelevant here |
| **Third-body perturbations** | Important for real satellites, not for this model |
| **Atmospheric drag** | — |
| **Solar variability** | TSI is constant at 1361 W/m²; the 11-year cycle (±0.1%) is absent |

## 8. Why this is currently sufficient — and where it stops being so

The astronomy exists to answer one question: **where is the Sun?** That
determines the terminator, which determines day/night, which determines the
energy input to every surface process.

It is sufficient for:
- The day/night terminator moving at the correct rate and tilting with
  season. ✔
- A seasonal cycle in insolation. ✔
- The length of day. ✔

It stops being sufficient the moment any of these appear:
- A surface energy balance integrated in time (needs accurate insolation,
  hence a real solar position).
- A tidal model with real amplitudes (needs the lunar ephemeris).
- Any climate simulation longer than a few thousand years (needs
  Milankovitch forcing).

## 9. Limitations

- **No ephemerides.** Planetary positions, eclipses and the true lunar orbit
  are absent.
- **Declination good to ~1°**, which is 111 km of ground distance — six DEM
  cells. Adequate for the terminator, not for a radiation budget.
- **Obliquity is constant.** Milankovitch forcing is not simulated.
- **No solar variability.**
- **No Moon position**, so tides are equilibrium amplitudes only.
- **Kepler is two-body.** No third-body perturbations, no drag.

## 10. Sources

IAU 2012 Resolution B2 (au) · IAU 2006 (obliquity) · IERS Conventions 2010 ·
Cooper (1969) solar declination · Meeus (1998) *Astronomical Algorithms* ·
Vallado (2013).

See `RESEARCH_SOURCES.md`.
