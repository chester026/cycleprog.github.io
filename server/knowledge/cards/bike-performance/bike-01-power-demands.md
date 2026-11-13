---
id: bike-01-power-demands
title: Where the power goes — gravity, air and rolling resistance
section: bike-performance
tags: [power-model, aerodynamics, rolling-resistance, gravity, physics]
evidence: A
populations: [recreational, trained, elite]
related: [bike-02-cda-position, bike-03-weight-vs-aero, bike-04-tyres, race-05-route-based-power-plan]
sources:
  - ref: "Martin JC, Milliken DL, Cobb JE, McFadden KL, Coggan AR. Validation of a mathematical model for road cycling power. J Appl Biomech. 1998;14(3):276-291."
    doi: 10.1123/jab.14.3.276
    type: observational
    verified: 2026-11-13
  - ref: "di Prampero PE, Cortili G, Mognoni P, Saibene F. Equation of motion of a cyclist. J Appl Physiol. 1979;47(1):201-206."
    type: observational
    verified: 2026-11-13
updated: 2026-11-13
---
## Summary
The power a rider produces is consumed by four things: air resistance, rolling resistance, gravity on gradients, and small losses in the drivetrain (plus changes in speed). A simple equation built from these terms predicts real-world power very accurately. It explains almost every equipment and pacing question: on the flat, air resistance dominates and grows with the cube of speed; on steep climbs, gravity dominates and mass is what matters.

## Key numbers
- Power at the wheel = aerodynamic (½ · ρ · CdA · v_air² · v) + rolling (Crr · m · g · v) + gravity (m · g · gradient · v); divide by drivetrain efficiency (about 0.96–0.98).
- Air density ρ: about 1.20 kg/m³ at sea level and 20 °C; about 1.0 at 1800 m.
- Flat example: 75 kg rider + 9 kg bike, 35 km/h, CdA 0.32, Crr 0.004: aero ≈ 176 W, rolling ≈ 32 W, total ≈ 215 W at the pedals. Aero share ≈ 82%.
- Climb example: same rider, 8% at 12 km/h: gravity ≈ 219 W, rolling ≈ 11 W, aero ≈ 8 W, total ≈ 245 W. Gravity share ≈ 89%.
- Because of the cubic relationship, 10% more speed on the flat needs about 30% more power; 10% more power gives only about 3% more speed.
- On climbs steeper than about 7–8%, speed rises almost in proportion to power.
- A 15 km/h headwind at 30 km/h riding speed roughly doubles the aerodynamic power.
- In the validation study, modelled and measured road power agreed with a standard error of a few watts.

## In practice
- Flat and rolling events: reduce CdA first, then rolling resistance.
- Mountain events: power-to-mass and pacing first; aerodynamics still matters on valley sections and descents.
- Time estimates for a route need mass, CdA, Crr and wind assumptions; small errors in CdA matter most on fast courses.

## Limits
Wind, drafting, road surface and braking add uncertainty in real rides; CdA and Crr are usually estimates.

## Coach guidance
Use these proportions to explain why a change will or will not matter for the rider's event before discussing equipment.
