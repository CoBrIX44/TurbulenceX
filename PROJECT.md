# PROJECT — Domino Sky

## Overview
Domino Sky is an AI-assisted flight disruption cascade and recovery simulator for an Indian domestic network. It loads the supplied `flight_network.json` (16 airports, 70 flights, 16 active aircraft, 16 crews, 21 passenger connections, 2 spares). Users inject disruptions at airports, watch a deterministic engine propagate the consequences, inspect why each flight is affected, and test recovery strategies with an AI dispatcher whose proposals are always re-simulated by the engine.

## Problem statement
A short, local event such as a 90-minute thunderstorm at Mumbai spreads through the network. Aircraft arrive late for their next legs, passengers miss connections, crews run out of duty time and airports congest. Controllers need to see the cascade before it happens, understand its causes, and compare recovery options quantitatively. Generic dashboards show symptoms. They do not show causality, and AI assistants that invent numbers cannot be trusted in operations.

## Product vision
"One disruption. A thousand consequences. One intelligent recovery system." An operations control experience that combines:
- a real-time-style **simulation environment** (simulated operating time, not live tracking),
- **network intelligence** (map, rotations, connections, crew, capacity),
- **explainability** (every delay has a traceable cause chain),
- **AI decision support** that explains and proposes but never computes operational figures.

## Target users
- **Operations controller (OCC duty manager)**: monitors the network, decides on recoveries.
- **Network planner / analyst**: stress-tests the schedule (slack, capacity headroom, crew margins).
- **Product, training and demo audiences**: learn how cascades work, using a real dataset.

## Core differentiators
1. **Deterministic engine as the single source of truth.** Integer-minute arithmetic, no randomness, identical outputs for identical inputs (tested).
2. **Explainable propagation.** Each flight carries delay components (departure restriction, ground delay, airborne hold, late inbound aircraft, ground handling, connection hold) with sources and a root cause, rendered as a causal graph.
3. **Validated AI.** The LLM selects engine-evaluated candidates or proposes structured actions. Every proposal is feasibility-checked and simulated. Numeric fields from the LLM are ignored, and unverified numbers in its narrative are flagged. A deterministic rule-based fallback is labelled as such.
4. **Honest data handling.** Passenger metrics are labelled as flight-level, connection-level or estimates. Assumptions not supported by the dataset (standby crews, ferry routing) are explicit and switchable.
5. **Recovery Lab.** Baseline, Disrupted and Recovered comparison, network recovery percentage, undo, strategy snapshots and scenario comparison.

## Success criteria
A user can open the app, see the real 16-airport / 70-flight network, configure a 90-minute BOM closure, run it, watch rotation delays cascade, identify delayed flights and their causes, see broken connections and crew violations, ask the AI dispatcher, apply a feasible spare deployment or cancellation, re-run, compare disrupted and recovered results, and confirm that every operational number came from the engine. All of this is covered by the Playwright suite (`frontend/e2e`) and the engine test suite.
