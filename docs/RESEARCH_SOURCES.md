# RESEARCH SOURCES

Every constant, equation and dataset in PROJECT TERRA traces to a source on
this page. If a number in the code has no traceable source here, that is a
bug — report it.

---

## Primary datasets (shipped as data)

### ETOPO1 global relief

- **Amante, C. and B. W. Eakins (2009).** *ETOPO1 1 Arc-Minute Global Relief
  Model: Procedures, Data Sources and Analysis.* NOAA Technical Memorandum
  NESDIS NGDC-24. DOI: `10.7289/V5C8276M`.
- **Mirror used:** <https://github.com/g2e/etopo10> (MIT licence), providing
  a 10 arc-minute derivative produced with GMT. Files
  `etopo10_ice_g_i2.bin` / `.hdr`.
- **Licence of the underlying data:** US Government work, public domain.
- **What we validated ourselves:** row order (north-up despite the header),
  area-weighted land fraction, ocean volume, mean ocean depth, land area,
  and nine named landmarks. See `SCIENCE_MASTER.md` §5.
- **Variant:** `_ice_` (ice-surface) rather than `_bed_` (bedrock), because
  the visual surface is what is being simulated.

### Periodic table

- **`mendeleev` 1.3.0** — atomic masses, densities, melting/boiling points,
  electron configurations, ionisation energies. Values trace to
  **CRC Handbook of Chemistry and Physics** (97th ed.) and **IUPAC**.
- **`periodictable` 2.1.0** — isotopic masses from **AME2020** (Wang et al.,
  *Chinese Physics C* 45, 030003, 2021) and half-lives from **NUBASE2020**
  (Kondev et al., *Chinese Physics C* 45, 030001, 2021).
- **Generator:** `scripts/generate_periodic_table.py`. The script applies an
  explicit null policy: missing data is `null`, never zero-filled.

---

## Fundamental constants

- **CODATA 2018** — Tiesinga et al., *Rev. Mod. Phys.* 93, 025010 (2021).
  Used for c, h, k_B, N_A, e, G, m_e, m_p, ε₀, μ₀, σ_SB, α, a₀,
  R∞, R.
- **IAU 2015 Resolution B3** — nominal solar and planetary constants
  (GM_Sun, GM_Earth, nominal radii).
- **IERS Conventions 2010** — GM_Earth = 3.986004418e14 m³/s²,
  J₂, J₃, J₄, Earth rotation rate.
- **WGS84 (NIMA TR8350.2, 3rd ed., 2000)** — a = 6378137.0 m,
  f = 1/298.257223563, normal gravity γ_e = 9.7803253359,
  γ_p = 9.8321849378 m/s².

---

## Atmosphere

- **NOAA/NASA/USAF (1976).** *U.S. Standard Atmosphere, 1976.*
  NASA-TM-X-74335. Layer boundaries, lapse rates, and the geopotential
  relation `H = R_eff z/(R_eff+z)` with `R_eff = 6 356 766 m`.
- **ISO 2533:1975** — standard atmosphere to 80 km; sea-level pressure
  101 325 Pa, T₀ 288.15 K.
- **IUPAC (2013).** *Quantities, Units and Symbols in Physical Chemistry.*
  Dry-air composition; mole fractions summing to 1.0000887 (the closure
  residual we report).
- **Bucholtz, A. (1995).** "Rayleigh-scattering calculations for the
  terrestrial atmosphere," *Applied Optics* 34(15), 2765–2773. Rayleigh
  cross-section with the King factor; N_s² scaling.
- **Bodhaine, B. A., N. B. Wood, E. G. Dutton and J. R. Slusser (1999).**
  "On Rayleigh optical depth calculations," *J. Atmos. Oceanic Technol.*
  16, 1854–1861. Reference optical depths (τ₅₅₀ = 0.0976).
- **Edlén, B. (1966).** "The refractive index of air," *Metrologia* 2, 71.
  Refractive index of air as a function of wavelength.
- **Buck, A. L. (1981).** "New equations for computing vapor pressure and
  enhancement factor," *J. Appl. Meteorol.* 20, 1527–1532. Saturation
  vapour pressure over water and ice.
- **Alduchov, O. A. and R. E. Eskridge (1996).** "Improved Magnus form
  approximation of saturation vapor pressure," *J. Appl. Meteorol.* 35,
  601–609. The 17.625/243.04 coefficients used for the dew/frost inverses.
- **Myhre, G. et al. (1998).** "New estimates of radiative forcing due to
  well-mixed greenhouse gases," *Geophys. Res. Lett.* 25, 2715–2718.
  Logarithmic CO₂ forcing.

---

## Gravity and orbital mechanics

- **Vallado, D. A. (2013).** *Fundamentals of Astrodynamics and
  Applications*, 4th ed. Kepler propagation, universal variables, Stumpff
  functions.
- **Battin, R. H. (1999).** *An Introduction to the Mathematics and Methods
  of Astrodynamics*. Universal Kepler solver.
- **Heiskanen, W. A. and H. Moritz (1967).** *Physical Geodesy*.
  Somigliana normal gravity, ellipsoid geometry.
- **Dziewonski, A. M. and D. L. Anderson (1981).** "Preliminary Reference
  Earth Model," *Phys. Earth Planet. Inter.* 25, 297–356. Density profile.

---

## Oceanography

- **Fofonoff, N. P. and R. C. Millard Jr. (1983).** *Algorithms for
  Computation of Fundamental Properties of Seawater.* UNESCO Technical
  Papers in Marine Science 44. The EOS-80 polynomial (equations 13–19),
  freezing point, and adiabatic lapse rate.
- **Millero, F. J. and A. Poisson (1981).** "International one-atmosphere
  equation of state of seawater," *Deep-Sea Res.* 28A(6), 625–629.
- **Chen, C.-T. and F. J. Millero (1977).** "Speed of sound in seawater at
  high pressures," *J. Acoust. Soc. Am.* 62, 1129–1135.
- **Reference implementation used for verification:**
  `python-seawater` (MIT), which implements the same UNESCO polynomials.
  Ten (S, t, p) points matched to < 1 ppm.
- **Lueker, T. J., A. G. Dickson and C. D. Keeling (2000).** "Ocean pCO₂
  calculated from dissolved inorganic carbon, alkalinity, and equations for
  K₁ and K₂," *Marine Chemistry* 70, 105–119. Seawater pK₁/pK₂.
- **Weiss, R. F. (1974).** "Carbon dioxide in water and seawater: the
  solubility of a non-ideal gas," *Marine Chemistry* 2, 203–215. CO₂
  solubility K₀ — **note the published series yields ln K₀**.
- **Gill, A. E. (1982).** *Atmosphere–Ocean Dynamics*. Ekman transport,
  geostrophy, Rossby radius.
- **Stewart, R. H. (2008).** *Introduction to Physical Oceanography.*
  Mixed layer, air–sea fluxes, thermohaline circulation.
- **Stommel, H. (1961).** "Thermohaline convection with two stable
  regimes," *Tellus* 13, 224–230. The two-box bistability model.
- **Pierson, W. J. and L. Moskowitz (1964).** "A proposed spectral form for
  fully developed wind seas," *J. Geophys. Res.* 69, 5181–5190.
- **Sverdrup, H. U. and W. H. Munk (1947).** *Wind, Sea and Swell: Theory of
  Relations for Forecasting.* Hydrographic Office Publ. 601. SMB wave
  forecasting.
- **Cushman-Roisin, B. and J.-M. Beckers (2011).** *Introduction to
  Geophysical Fluid Dynamics*, 2nd ed.
- **IPCC AR6 WG1 (2021),** Chapter 9 — sea-level budget, Table 9.5 ice-sheet
  sea-level equivalents.
- **RAPID array** — AMOC transport 17.2 ± 0.9 Sv at 26.5°N (Srokosz &
  Bryden 2015, *Science*).

---

## Solid Earth

- **Turcotte, D. L. and G. Schubert (2014).** *Geodynamics*, 3rd ed.
  Airy and Pratt isostasy, flexure, heat conduction.
- **Airy, G. B. (1855).** "On the computation of the effect of the attraction
  of mountain-masses," *Phil. Trans. R. Soc. Lond.* 145, 101–104.
- **Byerlee, J. (1978).** "Friction of rocks," *Pure Appl. Geophys.* 116,
  615–626. The friction law τ = 0.85σ_n / 50 + 0.6σ_n.
- **Jaupart, C. and J.-C. Mareschal (2011).** *Heat Generation and Transport
  in the Earth.*
- **Laske, G., G. Masters, Z. Ma and M. Pasyanos (2013).** "Update on
  CRUST1.0," EGU General Assembly. Mean continental crust 39 km, oceanic
  7 km.
- **Howard, A. D. and G. Kerby (1983).** "Channel changes in badlands,"
  *Geol. Soc. Am. Bull.* 94, 739–752. Stream-power incision.
- **Davies, J. H. and F. von Blanckenburg (1995).** "Slopes, boundary
  conditions and the age of the land surface," *Basin Research* 7, 25–41.
  Hillslope diffusivities.

---

## Thermodynamics and chemistry

- **NIST-JANAF Thermochemical Tables**, 4th ed. (Chase, 1998). ΔHf°, S°,
  Cp° for the ~60 species in `thermochemistry.js`.
- **CRC Handbook of Chemistry and Physics**, 97th ed. Standard enthalpies,
  entropies, Ksp values.
- **Atkins, P. and J. de Paula (2014).** *Physical Chemistry*, 10th ed.
  Gibbs–Helmholtz, Arrhenius, Eyring, van 't Hoff.
- **Arrhenius, S. (1889).** *Z. Phys. Chem.* 4, 226.
- **Eyring, H. (1935).** *J. Chem. Phys.* 3, 107. Transition-state theory.
- **Henry, W. (1803).** *Phil. Trans. R. Soc.* 93, 29–274.
- **Bethe, H. A. and R. F. Bacher (1936).** "Nuclear Physics A: Stationary
  states of nuclei," *Rev. Mod. Phys.* 8, 82. The semi-empirical mass
  formula.
- **Weizsäcker, C. F. von (1935).** *Z. Phys.* 96, 431.
- **Geiger, H. and J. M. Nuttall (1911).** "The ranges of the α particles
  from various radioactive substances," *Phil. Mag.* 22, 613–620.
- **ENSDF / NuDat 3.0** (NNDC, Brookhaven) — measured alpha decay Q values
  and half-lives.

---

## Particles and antimatter

- **Particle Data Group (2022/2023).** *Review of Particle Physics*,
  *Phys. Rev. D* 98 / Prog. Theor. Exp. Phys. Particle masses, annihilation
  branching ratios, cross-sections.
- **Griffiths, D. (2008).** *Introduction to Elementary Particles*, 2nd ed.
  Relativistic kinematics, annihilation, pair production.
- **Klein, O. and Y. Nishina (1929).** *Z. Phys.* 52, 853. Compton
  differential cross-section.
- **Compton, A. H. (1923).** "A quantum theory of the scattering of X-rays
  by light elements," *Phys. Rev.* 21, 483.
- **Berger, M. J. et al.** *XCOM: Photon Cross Sections Database*, NIST.
  Mass attenuation coefficients for water.
- **Knoll, G. F. (2010).** *Radiation Detection and Measurement*, 4th ed.
- **Krane, K. S. (1988).** *Introductory Nuclear Physics*. Fission energy
  breakdown (Table 13.1), Bateman equations.
- **Bethe, H. A. (1930).** *Ann. Phys.* 5, 325. Stopping power.
- **Bragg, W. H. and R. Kleeman (1905).** *Phil. Mag.* 10, 318. Range–energy
  relation.
- **Čerenkov, P. A. (1937).** *Phys. Rev.* 52, 378.
- **Schwinger, J. (1949).** "Quantum electrodynamics. I," *Phys. Rev.* 75,
  651. Annihilation cross-section.
- **NIST PSTAR** — proton stopping powers and ranges in water.
- **ENDF/B-VIII.0** — fast-group fission and transport cross-sections for
  U-235.

---

## Mathematics and numerics

- **Press, W. H. et al. (2007).** *Numerical Recipes*, 3rd ed. Brent's
  method, golden section, RK4, Cash–Karp.
- **Cash, J. R. and A. H. Karp (1990).** "A variable order Runge–Kutta method
  for initial value problems," *ACM TOMS* 16, 201–222.
- **Yoshida, H. (1990).** "Construction of higher order symplectic
  integrators," *Phys. Lett. A* 150, 262–268.
- **van Leer, B. (1979).** "Towards the ultimate conservative difference
  scheme V," *J. Comput. Phys.* 32, 101–136. MUSCL reconstruction.
- **Courant, R., K. Friedrichs and H. Lewy (1928).** "Über die partiellen
  Differenzengleichungen der mathematischen Physik," *Math. Ann.* 100,
  32–74. The CFL condition.
- **Leonard, B. P. (1991).** "The ULTIMATE conservative difference scheme
  applied to unsteady one-dimensional advection," *Comp. Meth. Appl. Mech.
  Eng.* 88, 17–74. Flux limiters.
- **Stanimirović, S., Č. Vukotić and N. Prša (2019).** "Time-domain
  astronomical signal processing," *J. Astrophys. Astron.* Root-finding
  and root polishing techniques.

---

## Rendering and visualisation

- **three.js r187** — sphere geometry parametrisation, DataTexture
  semantics (`flipY = false`), shader material API.
- **Nychka, D. et al. (2021).** *A Lesson in Color*, NCAR. Why perceptually
  uniform colormaps matter (and why the current sRGB interpolation is a
  documented limitation).
- **Horn, B. K. P. (1981).** "Hill shading and the reflectance map,"
  *Proc. IEEE* 69, 14–47. The Lambertian hill-shading model.
- **ICAO / ISO 2533** — the standard atmosphere used by the UI readout.

---

## Third-party software

| Package | Version | Licence | Use |
|---|---|---|---|
| `three` | 0.187.0 | MIT | rendering |
| `vite` | 8.3.8 | MIT | dev server / build |
| `vitest` | 5.1.0 | MIT | test runner |
| `mendeleev` | 1.3.0 | MIT | element data (build-time only) |
| `periodictable` | 2.1.0 | BSD | isotope data (build-time only) |
| `python-seawater` | 3.3.5 | MIT | EOS-80 verification only |

None of the build-time Python packages ship in the application bundle; they
are used once to generate `src/data/periodic-table.json`, which is what the
code actually reads.
