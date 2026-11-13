---
id: load-01-tss-np-if
title: TSS, Normalized Power and Intensity Factor — definitions and limits
section: load-data
tags: [TSS, normalized-power, intensity-factor, training-load, FTP]
evidence: C
populations: [recreational, trained, elite]
related: [load-02-ctl-atl-tsb, load-05-session-rpe, load-16-data-quality]
sources:
  - ref: "Allen H, Coggan A, McGregor S. Training and Racing with a Power Meter. 3rd ed. VeloPress; 2019."
    type: practice
    verified: false
  - ref: "Passfield L, Hopker JG, Jobson S, Friel D, Zabala M. Knowledge is power: issues of measuring training and performance in cycling. J Sports Sci. 2017;35(14):1426-1434."
    doi: 10.1080/02640414.2016.1215504
    type: review
    verified: 2026-11-13
updated: 2026-11-13
---
## Summary
Normalized Power (NP), Intensity Factor (IF) and Training Stress Score (TSS) are the standard power-based load metrics in cycling. They are practical conventions built on physiological reasoning, not validated measures of adaptation. They compress a ride into one number well enough to track load over time for one rider, as long as FTP is current.

## Key numbers
- NP: 30-s rolling average of power, each value raised to the 4th power, averaged, then the 4th root. Weights hard efforts more than average power does.
- IF = NP / FTP. Typical values: recovery <0.60, endurance 0.60–0.75, tempo 0.75–0.85, sweet spot/threshold 0.85–1.00 (for the whole ride).
- TSS = (seconds × NP × IF) / (FTP × 3600) × 100. One hour at FTP = 100.
- Rough recovery guide (practice): <150 TSS recovered by next day; 150–300 some residual fatigue next day; 300–450 fatigue for 2 days; >450 several days.
- Variability index (NP / average power): steady ride 1.00–1.05; hilly or group ride 1.10–1.30+.

## In practice
- Compare TSS within a rider over time, not between riders.
- A 5% error in FTP shifts IF by 5% and TSS by about 10% (TSS scales with the square of IF).
- NP is unreliable for efforts under about 20 min and for rides dominated by sprints.

## Limits
TSS treats all load as interchangeable: 100 TSS from 2.5 h easy and 100 TSS from 1 h at threshold stress the body very differently. It ignores heat, altitude, fuelling, sleep and prior fatigue. The 4th-power weighting was derived from lactate response data and is an approximation.

## Coach guidance
Use TSS for week-to-week volume of load; always pair it with what the load consisted of (hours, time in LOW/MID/HIGH). If FTP looks outdated (see `load-15-progress-vs-noise`), say that IF and TSS are skewed before interpreting them.
