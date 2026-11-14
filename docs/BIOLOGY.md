# BIOLOGY

**Status: NOT IMPLEMENTED.**
**Module:** none · **Tests:** none

---

## 1. Why this document exists

`BIOLOGY.md` is a required deliverable. It is written now, before any code,
for two reasons:

1. **To state plainly that nothing biological exists.** A missing document
   invites the assumption that the biology is somewhere else. There is none.
2. **To fix the interface before writing it**, so that the biological layer
   plugs into physics that is already validated rather than requiring the
   physics to be retrofitted.

Writing this section with invented "typical" numbers would violate the
project's first rule. Everything below is either a requirement, a named
external dataset, or an equation that is standard in the literature.

---

## 2. What the physics already provides as boundary conditions

Any ecology must be driven by fields that exist and are tested:

| Driver | Source | Status |
|---|---|---|
| Surface temperature | `fields.js` temperature layer | validated |
| Photosynthetically active radiation | derived from solar geometry + cloud fraction | geometry validated; **clouds absent** |
| Precipitation | **absent** | must be modelled or prescribed from a dataset |
| Soil moisture | **absent** | — |
| Ocean temperature and pH | `oceanography.js`, `thermochemistry.js` | validated |
| Nutrient supply | **absent** | — |
| Elevation and slope | `terrain.js` | validated |

**The blocking gap is the hydrological cycle.** Net primary productivity
cannot be computed from temperature and light alone; water availability is
the dominant control in most of the world. This is why biology is sequenced
after atmospheric dynamics, not before.

---

## 3. What a first implementation should contain

The minimum defensible biology, in order of increasing ambition:

### 3.1 Holdridge-style biome classification (static)

**Principle.** Biomes are determined by three climatological variables:
biologically effective precipitation, biotemperature, and the ratio of
potential evapotranspiration to precipitation.

**Status.** This is achievable **now** with a prescribed precipitation
climatology, and is a classification rather than a simulation — it does not
claim to model growth.

**Validation available.** A Holdridge classification of the modern climate
can be compared against the WWF terrestrial ecoregions map. Agreement should
be assessed by area, not by pixel (classification boundaries are inherently
fuzzy).

### 3.2 Net primary productivity (light-use efficiency)

**Principle.** The Monteith model: NPP is proportional to absorbed
photosynthetically active radiation, modulated by temperature and water
stress.

**Equation.**

```
NPP = ε · APAR · f(T) · f(W)
```

with ε the light-use efficiency (g C per MJ APAR), APAR the absorbed PAR,
and f(T), f(W) the temperature and water-stress scalars.

**Critical caveat.** ε is not a universal constant; published values span
0.4–3.0 g C/MJ depending on biome and method. Selecting one without saying
so would be inventing a constant. Any implementation must carry its ε and
its source in the constants table with an uncertainty.

**Validation available.** Global NPP is constrained by observation to
~55–60 Pg C/yr (MOD17, and the IPCC AR6 carbon budget). A model that
produces 200 or 5 Pg C/yr is wrong regardless of how plausible a single
pixel looks.

### 3.3 Carbon pools (box model)

**Principle.** Vegetation and soil carbon as reservoirs with input from NPP
and output by heterotrophic respiration and disturbance.

```
dC_veg/dt = NPP − litterfall − fire
dC_soil/dt = litterfall − respiration
```

**Validation available.** Global vegetation carbon ~450–650 Pg C, soil
carbon ~1 500–2 400 Pg C (IPCC AR6). Residence times 10–100 yr for
vegetation, 10²–10³ yr for soil.

---

## 4. What will *not* be attempted

| Not attempted | Why |
|---|---|
| Individual organisms / agent-based ecology | Not physically constrained; would be a game, not a simulation |
| Evolution | No timescale overlap with the rest of the model |
| Species distributions | Requires a dispersal and competition model with no validated parameters |
| Marine biogeochemistry beyond carbon | Iron limitation, oxygen minimum zones, and the biological pump all need an ocean GCM we do not have |
| Human systems | Out of scope |

---

## 5. Design constraints for the future module

Whatever is built must satisfy the rules the rest of the project already
follows:

1. **Every parameter carries a source and an uncertainty.** No "typical
   value".
2. **Validation against a global integral, not a local impression.** The
   test must assert total NPP is within the observed range.
3. **State the approximation in the layer's `note`,** so the UI cannot
   present a classification as a simulation.
4. **No biology may feed back into physics** until it has been validated in
   isolation. A carbon-cycle feedback that is not trustworthy must not be
   able to move the temperature.

---

## 6. Blocking dependencies

Biology cannot be implemented honestly until these exist:

| Dependency | Status |
|---|---|
| Precipitation field | **missing** — needs atmospheric dynamics or a prescribed climatology |
| Cloud fraction | **missing** |
| Nutrient fields | **missing** |
| Ocean circulation | diagnostic only |

## 7. Sources (for the equations above, not yet used)

- **Holdridge, L. R. (1947).** "Determination of world plant formations from
  simple climatic data," *Science* 105, 367–368.
- **Monteith, J. L. (1972).** "Solar radiation and productivity in tropical
  ecosystems," *J. Appl. Ecol.* 9, 747–766.
- **Running, S. W. et al. (2004).** "A continuous satellite-derived measure
  of global terrestrial primary production," *BioScience* 54, 547–560
  (MOD17).
- **IPCC AR6 WG1 (2021),** Chapter 5 — global carbon budget.
- **Olson, D. M. et al. (2001).** "Terrestrial ecoregions of the world,"
  *BioScience* 51, 933–938.

See `RESEARCH_SOURCES.md`.
