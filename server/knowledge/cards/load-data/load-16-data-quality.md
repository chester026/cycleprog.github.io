---
id: load-16-data-quality
title: Data quality problems in ride files
section: load-data
tags: [data-quality, power-meter, calibration, spikes, heart-rate-sensor, estimated-power]
evidence: C
populations: [recreational, trained]
related: [load-15-progress-vs-noise, load-01-tss-np-if]
sources:
  - ref: "Maier T, Schmid L, Müller B, Steiner T, Wehrlin JP. Accuracy of cycling power meters against a mathematical model of treadmill cycling. Int J Sports Med. 2017;38(6):456-461."
    doi: 10.1055/s-0043-102945
    type: observational
    verified: 2026-11-13
  - ref: "Passfield L, Hopker JG, Jobson S, Friel D, Zabala M. Knowledge is power: issues of measuring training and performance in cycling. J Sports Sci. 2017;35(14):1426-1434."
    doi: 10.1080/02640414.2016.1215504
    type: review
    verified: 2026-11-13
updated: 2026-11-13
---
## Summary
Every conclusion drawn from a ride file depends on the sensors behind it. Before interpreting power or heart rate, check for the common faults: uncalibrated or drifting power meters, spikes and dropouts, estimated instead of measured power, single-sided measurement, and unreliable optical heart rate. When data quality is doubtful, say so and base the analysis on what is trustworthy.

## Key numbers
- Power meters: most are specified at ±1–2%; independent testing found a spread of several percent between individual units, so values from two different meters (or a trainer and a crank) can differ by 3–5%.
- Zero offset: perform before rides and after large temperature changes; drift of 5–10 W is possible without it.
- Single-sided meters double one leg: a 48/52 balance produces about a 4% error, and balance changes with fatigue and intensity.
- Spikes: any reading above about 2000 W, or a 1-s jump of 500+ W with no cadence change, is an artefact; one spike can inflate 5-s bests and NP.
- Dropouts: runs of zeros while speed and cadence continue lower average power and NP.
- Estimated power (from speed, gradient and weight) can be wrong by 10–30% in wind or in a group; unusable for zones or bests.
- Optical wrist heart rate on the bike: errors of 5–20 beats/min during intervals and on rough roads; chest straps are within 1–2 beats.
- Auto-pause and smart recording affect duration and averages.

## In practice
- Flag implausible bests (e.g. 5-s power far above the rider's history, 20-min power above 60-min history by more than about 15%).
- Heart rate that jumps to a plateau near cadence values is cadence lock from an optical sensor.
- Treat indoor and outdoor power as separate series unless the same meter is used for both.
- If a file has estimated power, restrict analysis to duration, heart rate, elevation and RPE.

## Limits
Many artefacts cannot be distinguished from real efforts with certainty; state the doubt.

## Coach guidance
Mention a data issue once, briefly, with what it affects. Do not build praise or criticism on a number that is probably an artefact.
