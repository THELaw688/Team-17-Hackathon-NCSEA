# Role 5 — Lateral inputs

What role 5 (lateral loads + diaphragm) needs from the input panel to replace the hand-typed **Cs**
and **Wind (psf)** with ASCE 7-22 inputs. Written for role 1 (Nick), who owns `index.html`,
`app.js` and `model.js`. Role 5 writes the math in `LP.storyForces` and `LP.distribute`.

**Proposed, not yet agreed.** Raise it in chat if anything here doesn't fit.

## Ask for role 1 (MVP)

Add these to the "Lateral loads" panel and to `b.inputs.lateral`. Keep the existing **Cs** and
**Wind (psf)** boxes as an "Override" mode so the simple teaching version still works.

| Input | Control | Default | Proposed key in `inputs.lateral` |
|---|---|---|---|
| Risk category | dropdown I / II / III / IV | II | `riskCategory: 'II'` |
| SDS (g) | number | 1.00 | `SDS: 1.0` |
| SD1 (g) | number | 0.60 | `SD1: 0.6` |
| Lateral system | dropdown (fills R, Ct, x) | Special RC shear walls | `system: 'specialRCWall'` |
| Basic wind speed V (mph) | number | 105 | `windSpeed: 105` |
| Exposure | dropdown B / C / D | C | `exposure: 'C'` |
| Accidental torsion | checkbox | on | `accidentalTorsion: true` |
| Input mode | toggle ASCE 7 / Override | ASCE 7 | `mode: 'asce7'` (`'override'` uses `Cs` and `windPressure` as today) |

Role 5 keeps the lookup tables (system → R, Ω₀, Cd, Ct, x; risk category → Ie; exposure → Kz) in
`lateral.js`, so the panel only passes the selections.

## Full list

**MVP** = building today. Defaults are typical values so the app runs without edits.

### General
| Input | Default | Drives | Priority |
|---|---|---|---|
| Risk category | II | Seismic Ie (1.0 / 1.0 / 1.25 / 1.5) | MVP |
| Load level: Service (ASD) / Strength | Service | 0.6W and 0.7E for ASD; the app already says "service loads" | Nice to have |

### Seismic (ASCE 7 Ch. 11–12)
| Input | Default | Drives | Priority |
|---|---|---|---|
| SDS | 1.00 g | Cs = SDS / (R / Ie) | MVP |
| SD1 | 0.60 g | Upper limit Cs ≤ SD1 / (T R / Ie) | MVP |
| Lateral system | Special RC shear walls | R = 5, Ω₀ = 2.5, Cd = 5, Ct = 0.02, x = 0.75 | MVP |
| R (auto, editable) | 5 | Response modification | MVP |
| S1 | 0.60 g | Extra minimum Cs ≥ 0.5 S1 / (R / Ie) when S1 ≥ 0.6g | Nice to have |
| Extra seismic weight | 10 psf (partitions) | Added to floor dead for W | Nice to have |
| Cladding weight | 15 psf of wall | Perimeter wall mass at each level | Nice to have |
| Period override Cu Ta | blank | Replaces T = Ct hₙˣ | Stretch |
| TL | 8 s | Long-period limit; rarely controls here | Stretch |
| Ω₀, Cd | from system | Collector overstrength, drift (role 6 may use) | Stretch |

Calculation shown in the panel: T = Ct hₙˣ → Cs with its upper and lower limits
(Cs ≥ 0.044 SDS Ie ≥ 0.01) → V = Cs W → Fx = Cvx V with k interpolated between 1 (T ≤ 0.5 s) and
2 (T ≥ 2.5 s).

### Wind (ASCE 7 Ch. 26–27, directional procedure, simplified)
| Input | Default | Drives | Priority |
|---|---|---|---|
| Basic wind speed V | 105 mph | qz = 0.00256 Kz Kzt Ke V² | MVP |
| Exposure | C | Kz at each floor height | MVP |
| Kzt (topography) | 1.0 | Hills and escarpments | Nice to have |
| Enclosure | Enclosed | Shown only; internal pressure cancels in the net force | Nice to have |
| Ke (ground elevation) | 1.0 | High-altitude sites | Stretch |
| Parapet height | 0 ft | Extra roof-level force | Stretch |

Fixed in code and shown in the calc lines, no input box: Kd = 0.85, G = 0.85 (rigid building),
windward Cp = 0.8, leeward Cp from plan L/B (−0.5 at ≤ 1, −0.3 at 2, −0.2 at ≥ 4).

### Diaphragm and torsion (`LP.distribute`)
| Input | Default | Drives | Priority |
|---|---|---|---|
| Accidental torsion | on | ±5% eccentricity, worse case per wall (ASCE 7 12.8.4.2) | MVP |
| Accidental eccentricity % | 5 | Lets users see its effect | Nice to have |
| Diaphragm: Envelope | — | New dropdown option: run flexible and rigid, keep the larger force per wall | Nice to have |
| Torsional amplification Ax | off | 12.8.4.3; needs drifts | Stretch |

## Order of work

1. Accidental torsion: inside `LP.distribute` only, needs nothing from role 1.
2. Seismic inputs: needs the risk category, SDS, SD1 and lateral system boxes.
3. Wind inputs: needs the wind speed and exposure boxes.
4. Semi-rigid note, then the Envelope diaphragm option.

Simplified teaching methods, not for design. Calc lines cite the ASCE 7 section they follow.
