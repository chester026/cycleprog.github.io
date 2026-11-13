---
id: race-05-route-based-power-plan
title: Building a power plan from a route file
section: race-execution
tags: [race-plan, GPX, FIT, segments, pacing-plan, head-unit, Garmin-Edge]
evidence: C
populations: [recreational, trained]
related: [race-04-pacing-long-events, race-02-pacing-a-climb, race-06-fuel-schedule-on-course, bike-01-power-demands, load-12-durability-metrics]
sources:
  - ref: "Martin JC, Milliken DL, Cobb JE, McFadden KL, Coggan AR. Validation of a mathematical model for road cycling power. J Appl Biomech. 1998;14(3):276-291."
    doi: 10.1123/jab.14.3.276
    type: observational
    verified: 2026-11-13
  - ref: "Coaching practice synthesis (no single source)."
    type: practice
    verified: false
updated: 2026-11-13
---
## Summary
A route file (GPX or FIT) contains distance and elevation, which is enough to turn general pacing rules into a section-by-section plan: a power range for each climb, flat and descent, an estimated time for each, and eat/drink prompts placed where the terrain allows. The physics of cycling power is well validated, so time estimates from power, mass and drag are reliable to within a few percent in calm conditions. The plan can be loaded onto a head unit as distance-based workout steps, with the instruction for each section shown as the step note.

## Method
1. **Smooth and segment** the elevation profile: merge points into sections where gradient is roughly constant; minimum length about 500 m–1 km; label each as climb (above about 3%), rolling, flat or descent.
2. **Estimate duration** of each section with the power model (see `bike-01-power-demands`) using rider + bike mass, CdA and rolling resistance.
3. **Assign targets** from duration and position in the event:
   - climbs: table in `race-02-pacing-a-climb` ("one of several" column);
   - flats/rolling: 65–75% FTP (lower in a group);
   - descents steeper than about 3–4%: recover, under 50% or coasting;
   - short rises under 2 min: up to 95–105%.
4. **Apply a durability discount**: after roughly two-thirds of expected work (or beyond the rider's longest recent ride), lower targets 5–10%.
5. **Check the whole**: resulting Intensity Factor against the duration limits in `race-04-pacing-long-events`; no section draining W′ fully in the first half. Scale all targets down if the total is too high.
6. **Add fuelling prompts** every 15–20 min, moved to flats, gentle gradients and the approach to climbs; drink prompts likewise; note feed stations.
7. **Export** as steps keyed to distance: each step has a power range and a short note ("Climb 6.2 km · 215–230 W · eat before top").

## Key numbers
- Model accuracy in calm conditions: standard error of a few watts against measured power in the validation study.
- Inputs needed: FTP, body mass, bike + kit mass (default 9–10 kg), position (CdA default 0.32–0.36 on the hoods), tyre/surface (Crr 0.004–0.006 road).
- Wind of 15 km/h changes flat-section times by 10–15%; state the no-wind assumption.

## Limits
Elevation data are noisy; gradients on short sections can be badly wrong. Group riding, wind, heat and stops change times. The plan is a guide: perceived effort overrides it when conditions differ.

## Coach guidance
Ask for missing inputs (mass, position, event goal) or state the defaults used. Keep step notes short enough to read at a glance on a bike computer. Present targets as ranges and remind the rider that the first third should feel easy.
