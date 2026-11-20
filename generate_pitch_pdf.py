"""Generate the 90-Minute Pitching Script and Technical Codebase Defense PDF for Domino Sky."""

import os
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(54, 11 * inch - 36, "DOMINO SKY (TURBULENCEX) — 90-MINUTE MASTER PITCH & TECHNICAL DEFENSE")
            self.drawRightString(8.5 * inch - 54, 11 * inch - 36, "FLIGHT OPERATIONS CONTROL & RECOVERY")
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.5)
            self.line(54, 11 * inch - 42, 8.5 * inch - 54, 11 * inch - 42)
        
        # Footer
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(54, 46, 8.5 * inch - 54, 46)
        self.drawString(54, 32, "CONFIDENTIAL — AIRLINE OPERATIONS CONTROL SYSTEM ARCHITECTURE")
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(8.5 * inch - 54, 32, page_str)
        self.restoreState()


def build_pdf(filename="DOMINO_SKY_90_MINUTE_PITCH_SCRIPT.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=6
    )
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#2563EB"),
        spaceAfter=15
    )
    h1_style = ParagraphStyle(
        'SectionH1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=20,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True
    )
    h2_style = ParagraphStyle(
        'SectionH2',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#1E3A8A"),
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )
    h3_style = ParagraphStyle(
        'SectionH3',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#334155"),
        spaceBefore=6,
        spaceAfter=2,
        keepWithNext=True
    )
    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#334155"),
        spaceAfter=6
    )
    spoken_style = ParagraphStyle(
        'SpokenDialogue',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#0F172A")
    )
    cue_style = ParagraphStyle(
        'StageCue',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#B45309")
    )
    code_callout = ParagraphStyle(
        'CodeCallout',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#0F172A")
    )
    q_style = ParagraphStyle(
        'Question',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor("#991B1B"),
        spaceBefore=8,
        spaceAfter=2,
        keepWithNext=True
    )
    a_style = ParagraphStyle(
        'Answer',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12.5,
        textColor=colors.HexColor("#1E293B"),
        spaceAfter=6
    )

    story = []

    # Title Banner
    story.append(Paragraph("DOMINO SKY (TURBULENCEX)", title_style))
    story.append(Paragraph("90-Minute Master Pitching Script & Technical Codebase Defense", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#2563EB"), spaceBefore=0, spaceAfter=12))

    # Meta Table
    meta_data = [
        [
            Paragraph("<b>Target Audience:</b> Technical Reviewers, Flight Ops Executives, Airline Architects", body_style),
            Paragraph("<b>Total Time:</b> 90 Minutes (70 min Presentation + 20 min Technical Q&A)", body_style)
        ],
        [
            Paragraph("<b>Core Thesis:</b> Deterministic Simulation + Zero-Trust AI for IROPS Disruption Recovery", body_style),
            Paragraph("<b>Authoritative Dataset:</b> 16 Airports, 70 Flights, 16 Aircraft, 16 Crews, 21 Connections", body_style)
        ]
    ]
    t_meta = Table(meta_data, colWidths=[270, 234])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#E2E8F0")),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 14))

    # Agenda Table
    story.append(Paragraph("Presentation Session Roadmap (90-Minute Timeline)", h2_style))
    agenda_data = [
        ["Phase", "Time Allocation", "Topic & Focus Area", "Live Interaction / Deliverable"],
        ["Phase 1", "00:00 – 00:15 (15 min)", "The $30B Airline Crisis & The Domino Effect", "The 4 Coupling Dimensions of OCC; Legacy Failures"],
        ["Phase 2", "00:15 – 00:30 (15 min)", "Architecture & Ground Rules", "Deterministic Engine, Immutable Dataset, AI Boundaries"],
        ["Phase 3", "00:30 – 00:50 (20 min)", "The Simulation Engine (Under the Hood)", "SlotBook, Chronological Pass, Slack Absorption, Cascades"],
        ["Phase 4", "00:50 – 01:05 (15 min)", "Recovery Optimization Mathematics", "4 Action Primitives, Dijkstra Positioning, Impact Index"],
        ["Phase 5", "01:05 – 01:15 (10 min)", "The Zero-Trust AI Dispatcher", "Candidate Selection, Re-simulation Barrier, Anti-Hallucination"],
        ["Phase 6", "01:15 – 01:30 (15 min)", "Live End-to-End Flagship Demonstration", "BOM 90-min Thunderstorm, Causal DAG, Live Recovery"],
        ["Phase 7", "01:30 – 01:45+ (15+ min)", "Deep Technical Codebase Defense & Q&A", "15 Tough Codebase & Architectural Defense Questions"]
    ]
    t_agenda = Table(agenda_data, colWidths=[55, 115, 185, 149])
    t_agenda.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1E293B")),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 8),
        ('BOTTOMPADDING', (0,0), (-1,0), 5),
        ('TOPPADDING', (0,0), (-1,0), 5),
        ('BACKGROUND', (0,1), (-1,-1), colors.HexColor("#FFFFFF")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('FONTSIZE', (0,1), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
    ]))
    story.append(t_agenda)
    story.append(Spacer(1, 14))

    # Helper function for cue/spoken box
    def add_presentation_block(cue_text, spoken_text, tech_text=None):
        content = []
        content.append(Paragraph(f"<b>[STAGE & SLIDE ACTION]:</b> {cue_text}", cue_style))
        content.append(Spacer(1, 3))
        content.append(Paragraph(f"<b>[SPOKEN SCRIPT]:</b> \"{spoken_text}\"", spoken_style))
        if tech_text:
            content.append(Spacer(1, 4))
            content.append(Paragraph(f"<b>[TECHNICAL ARCHITECTURE CONTEXT]:</b> {tech_text}", code_callout))
        t = Table([[content]], colWidths=[504])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F1F5F9")),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(t)
        story.append(Spacer(1, 8))

    # -------------------------------------------------------------
    # PHASE 1
    # -------------------------------------------------------------
    story.append(Paragraph("Phase 1: The Macro Problem & The Airline OCC Reality (00:00 – 00:15)", h1_style))
    story.append(Paragraph("Objective: Establish domain gravity, explain the fragility of airline operations, and expose why existing tools and naive LLMs fail.", body_style))

    add_presentation_block(
        "Open on Slide 1: 'One Disruption. A Thousand Consequences.' Project Logo and Dark OCC Terminal aesthetic.",
        "Good morning/afternoon everyone. In commercial aviation, there is an uncomfortable truth that every Director of Flight Operations knows: an airline does not run on separate flights. It runs on a fragile, hyper-coupled kinetic web. When a severe convective thunderstorm rolls over Mumbai Airport at 8:00 AM and shuts runways for 90 minutes, common intuition assumes that Mumbai flights are delayed by 90 minutes. That intuition is completely wrong. What actually happens is an operational cascade—a systemic shockwave that propagates through aircraft rotations, breaches legal crew duty limits, shatters passenger connections across Delhi, Bengaluru, and Kolkata, and grounds aircraft 800 miles away under clear blue skies.",
        "Industry metric: Global IROPS (Irregular Operations) cost airlines over $30B annually in direct operational costs, passenger compensation (EU261 / DGCA CAR), and aircraft repositioning."
    )

    add_presentation_block(
        "Transition to Slide 2: The 4 Coupling Dimensions of Airline Operations Control.",
        "Why does this cascade happen? Because commercial airlines are bound by four unbreakable constraints that must synchronize perfectly in space and time:<br/>"
        "1. <b>Aircraft Rotations:</b> Modern low-cost and network carriers achieve profitability through high fleet utilization. A single airframe operates 4 to 6 legs per day with turnaround buffers as low as 30 to 45 minutes.<br/>"
        "2. <b>Crew Legality:</b> Pilots and cabin crew operate under statutory duty ceilings—strictly 600 minutes (10 hours) in our dataset. Unlike a machine, when a crew's duty clock expires, they cannot fly another minute without violating federal civil aviation safety regulations.<br/>"
        "3. <b>Passenger Transfer Windows:</b> Passengers travel on itinerary networks. Hub airports enforce Minimum Connection Times (MCT) between 40 and 45 minutes. If an inbound flight slips by just 15 minutes past scheduled ground slack, connections are severed.<br/>"
        "4. <b>Airport Slot Capacities:</b> Runways and airspace sectors have finite throughput per hour. You cannot simply land 50 airplanes at 9:30 AM when an airport reopens; they must queue chronologically."
    )

    add_presentation_block(
        "Transition to Slide 3: The OCC Technology Gap & The GenAI Trap.",
        "When disruptions strike, how do Operations Control Centers (OCCs) currently respond? Controllers are surrounded by disconnected systems: a legacy crew tracking terminal, a radar display, and manual spreadsheets. Dispatchers scramble under immense cognitive pressure, making heuristic guesses.<br/>"
        "Now, you might ask: 'Why not just feed the flight schedules into ChatGPT or an LLM agent and let it fix the schedule?'<br/>"
        "That would be catastrophic. Large Language Models are probabilistic token predictors. They do not maintain physical conservation laws. An LLM will happily invent an extra runway slot, hallucinate that a Boeing 737 flew from Delhi to Chennai in 40 minutes, violate a crew duty limit, or schedule a spare aircraft in two cities at the same time.<br/>"
        "Domino Sky was designed to solve this crisis through an architectural breakthrough: <b>A Pure Deterministic Simulation Engine that owns 100% of the mathematical truth, paired with an AI Dispatcher constrained by a Zero-Trust Execution Barrier.</b>"
    )

    # -------------------------------------------------------------
    # PHASE 2
    # -------------------------------------------------------------
    story.append(Paragraph("Phase 2: Architectural Principles & Ground Rules (00:15 – 00:30)", h1_style))
    story.append(Paragraph("Objective: Walk through repository structure, the 5 unbreakable ground rules, and technical boundaries.", body_style))

    add_presentation_block(
        "Slide 4: High-Level Architecture Diagram (Engine, API, Store, Dispatcher, Frontend).",
        "Let us examine the architecture of Domino Sky. The codebase is organized into four strictly segregated tiers:<br/>"
        "• <b>app/engine:</b> The heart of the platform. Written in pure Python 3.11 with Pydantic v2. It contains zero web dependencies, zero HTTP handlers, and zero LLM imports. It is an independent, mathematically pure discrete-event simulator.<br/>"
        "• <b>app/dispatcher:</b> The intelligent advisory layer. Houses the LLM provider abstraction, prompt synthesis, and our deterministic rule-based fallback engine.<br/>"
        "• <b>app/api:</b> FastAPI REST routes exposing simulation, scenario persistence, recovery evaluation, and data exports.<br/>"
        "• <b>frontend:</b> A modern Operations Control Center interface built with React 19, TypeScript, Vite, Tailwind CSS v4, and Zustand. The client is strictly presentational; it calculates zero operational metrics.",
        "Architectural Rule: backend/app/engine must NEVER import FastAPI, httpx, or LLM packages. Test enforces isolation."
    )

    add_presentation_block(
        "Slide 5: The 5 Non-Negotiable Ground Rules of Domino Sky.",
        "To ensure production-grade integrity, we instituted 5 foundational ground rules that govern every line of code in this repository:<br/>"
        "<b>Rule 1: The Engine is the Source of Truth.</b> Every delay minute, passenger count, and KPI shown in the UI is computed by backend/app/engine. The frontend only formats and interpolates.<br/>"
        "<b>Rule 2: Never Modify flight_network.json.</b> The network dataset (16 airports, 70 flights, 16 aircraft, 16 crews, 21 connections, 2 spares) is immutable. A startup test verifies that the backend copy is byte-identical to root.<br/>"
        "<b>Rule 3: AI Never Mutates State.</b> An LLM can never update a database or emit unverified numbers. It can only propose actions that pass strict feasibility checks and re-simulation.<br/>"
        "<b>Rule 4: Absolute Mathematical Determinism.</b> No random number generators, no datetime.now() wall-clock dependencies, and strictly ordered dictionary iterations. The same input produces byte-identical JSON every single time.<br/>"
        "<b>Rule 5: Report, Don't Silently Patch.</b> Dataset inconsistencies are surfaced via validation reports, never silently auto-corrected."
    )

    # -------------------------------------------------------------
    # PHASE 3
    # -------------------------------------------------------------
    story.append(Paragraph("Phase 3: The Simulation Engine Deep Dive (00:30 – 00:50)", h1_style))
    story.append(Paragraph("Objective: Explain the core event loop, time arithmetic, slot allocation, slack absorption, and cascade mechanics.", body_style))

    add_presentation_block(
        "Slide 6: Discrete-Event Chronological Pass & Slot Booking (simulator.py).",
        "Let us look under the hood of backend/app/engine/simulator.py. How does the simulation engine run?<br/>"
        "Time is modeled as integer minutes from midnight IST (0 to 1440+), completely eliminating floating-point errors and timezone confusion.<br/>"
        "The engine operates a single-pass, global chronological event loop. In each iteration, it inspects the next unflown leg across all 16 aircraft and selects the candidate with the earliest ready time: ready = max(sched_dep, prev_actual_arr + 30 + ground_penalty). Ties are broken deterministically by scheduled departure, then leg ID.<br/>"
        "This global chronological order is critical: it allows our SlotBook data structure to allocate shared airport runway capacity first-come-first-served, exactly like real Air Traffic Control."
    )

    add_presentation_block(
        "Slide 7: Slack Absorption vs. Delay Propagation.",
        "Here is a vital operational concept implemented in plan.py and simulator.py: <b>Slack Absorption</b>.<br/>"
        "In our dataset, flight turnaround times vary. While the minimum physical turnaround is 30 minutes, an aircraft may be scheduled with 70 minutes of ground time. That extra 40 minutes is scheduled buffer slack.<br/>"
        "If an inbound flight arrives 30 minutes late, the engine does not delay the outbound flight! The buffer absorbs the delay, and the outbound flight departs exactly on time.<br/>"
        "However, if the inbound flight is 75 minutes late, the buffer absorbs 40 minutes, and the remaining 35 minutes cascades downstream into the next leg. This is why our delays match real-world flight operations."
    )

    add_presentation_block(
        "Slide 8: Disruption Physics & The Out-of-Position Cancellation Trap.",
        "When an airport restricts capacity or closes, how does the engine decide between holding at the gate versus airborne holding?<br/>"
        "• If the destination restriction began <i>before</i> the flight's departure, the flight is held on the ground at the origin gate (Ground Delay Program).<br/>"
        "• If the flight was <i>already airborne</i> when the destination closed, the departure time remains fixed, and arrival time is delayed to model airborne holding.<br/>"
        "Furthermore, look at how the engine handles cancellations: If an airline naively cancels leg N (e.g., BOM to DEL), the aircraft is left sitting at BOM. If leg N+1 was scheduled to depart from DEL, the aircraft is physically not there! The engine automatically detects this mismatch and cancels leg N+1 as 'aircraft out of position'. To cancel safely, controllers must cancel round-trip pairs (BOM-DEL and DEL-BOM), keeping the aircraft in place."
    )

    add_presentation_block(
        "Slide 9: Explainability Architecture & Causal Lineage.",
        "Every single flight result generated by the engine contains a complete explainability ledger in FlightResult:<br/>"
        "• <b>components:</b> An array of delay deltas attributed to specific causes: rotation, departure_restriction, arrival_ground_delay, airborne_hold, ground_handling, connection_hold, or spare_positioning.<br/>"
        "• <b>primary_reason:</b> The single largest contributor to the flight's delay.<br/>"
        "• <b>root_cause:</b> The ultimate originating event traced backward through the entire rotation tree.<br/>"
        "• <b>introduced vs. inherited delay:</b> Clearly separates how much delay was handed to this flight from prior legs versus how much new delay was generated on this leg."
    )

    # -------------------------------------------------------------
    # PHASE 4
    # -------------------------------------------------------------
    story.append(Paragraph("Phase 4: Recovery Optimization Mathematics (00:50 – 01:05)", h1_style))
    story.append(Paragraph("Objective: Unpack the 4 recovery action primitives, Dijkstra ferry routing, and the Passenger Impact Index objective function.", body_style))

    add_presentation_block(
        "Slide 10: The Four Recovery Action Primitives (plan.py & recovery_search.py).",
        "When a disruption occurs, the controller has four canonical recovery levers:<br/>"
        "1. <b>deploy_spare:</b> We have two 180-seat spare aircraft: VT-DS17 at Bengaluru (BLR) and VT-DS18 at Delhi (DEL). When deployed, the spare replaces a delayed tail from a specific flight onward.<br/>"
        "2. <b>cancel_flights:</b> Cancels specific legs to protect downstream schedule integrity, checking for out-of-position side-effects.<br/>"
        "3. <b>swap_aircraft:</b> Two aircraft meeting at the same airport exchange their remaining rotations, allowing an on-time aircraft to take over a high-priority flight while validating crew legality.<br/>"
        "4. <b>protect_connection:</b> Authorizes an outbound flight to hold at the gate (up to max_hold_min, e.g., 60 minutes) to save connecting passengers."
    )

    add_presentation_block(
        "Slide 11: Dijkstra Ferry Positioning & Standby Crew Feasibility.",
        "Notice a key detail: You cannot simply teleport a spare aircraft. If spare VT-DS18 is based at Delhi (DEL) and you want to deploy it to rescue a rotation starting in Mumbai (BOM), how does it get there?<br/>"
        "In plan.py, we implement a custom Dijkstra shortest-path algorithm across the airline's scheduled route graph. The spare flies actual scheduled block times along routes the airline operates, factoring in 30-minute turnarounds at intermediate stops.<br/>"
        "Furthermore, the engine verifies the standby crew assumption: the ferry flight and subsequent legs must not exceed the standby crew's maximum duty ceiling (600 minutes)."
    )

    add_presentation_block(
        "Slide 12: The Objective Function: Passenger Impact Index & Network Recovery %.",
        "How do we know if a recovery action is actually beneficial? We formulated a mathematically rigorous objective function:<br/>"
        "<b>Impact Index = (Total Pax Delay Minutes) + (240 × Cancelled Pax) + (180 × Missed Connection Pax)</b><br/>"
        "Why the fixed penalties? Because if cancelling a flight were free, an algorithm would simply cancel all flights to achieve zero delay! Charging a 240-minute penalty per cancelled passenger forces cancellations to be an absolute last resort.<br/>"
        "We then define Network Recovery Percentage as:<br/>"
        "<b>Recovery % = (Impact_disrupted - Impact_recovered) / (Impact_disrupted - Impact_baseline) × 100%</b><br/>"
        "This gives controllers an unambiguous, quantifiable efficiency metric."
    )

    # -------------------------------------------------------------
    # PHASE 5
    # -------------------------------------------------------------
    story.append(Paragraph("Phase 5: The Zero-Trust AI Dispatcher (01:05 – 01:15)", h1_style))
    story.append(Paragraph("Objective: Demonstrate the safety architecture of the LLM pipeline, prompt engineering, and fallback guarantees.", body_style))

    add_presentation_block(
        "Slide 13: The AI Dispatcher Architecture & Safety Barrier (dispatcher/service.py).",
        "Now let us examine how the AI Dispatcher operates without introducing risk.<br/>"
        "When the user clicks 'Get Recovery Recommendations', the backend does NOT ask an LLM: 'Here are 70 flights, tell me what to do.'<br/>"
        "Instead, the engine first runs recovery_search.py, deterministically generating and simulating the top 30 feasible candidate actions. It computes the exact impact delta for every candidate.<br/>"
        "The dispatcher then presents these pre-evaluated candidates to the LLM in a structured prompt. The LLM's job is to act as an executive dispatcher: selecting the best candidate by candidate_id, reasoning about qualitative trade-offs, and explaining the operational rationale in plain English."
    )

    add_presentation_block(
        "Slide 14: Anti-Hallucination Regex Scanner & Fallback Engine.",
        "What happens if the LLM hallucinates or returns malformed numbers?<br/>"
        "We enforce three layers of protection:<br/>"
        "1. <b>Numerical Discard:</b> Any numeric metrics the LLM returns in JSON are completely thrown away. The UI only renders numbers computed by the engine.<br/>"
        "2. <b>Anti-Hallucination Regex Scanner:</b> The service scans the LLM's narrative prose for numbers. If the LLM mentions '48 passengers' or '120 minutes', the scanner checks if those numbers existed in the engine's prompt context. If not, they are tagged as unverified_numbers.<br/>"
        "3. <b>Deterministic Rule Fallback:</b> If no LLM API key is provided, or if the LLM endpoint times out, the system seamlessly activates the deterministic rule engine, ranking candidates by impact reduction with zero downtime."
    )

    # -------------------------------------------------------------
    # PHASE 6
    # -------------------------------------------------------------
    story.append(Paragraph("Phase 6: Live Walkthrough & Flagship Demonstration (01:15 – 01:30)", h1_style))
    story.append(Paragraph("Objective: Step-by-step interactive live demo in the browser showing the Mumbai Thunderstorm scenario and recovery.", body_style))

    add_presentation_block(
        "Switch screen to live browser at http://localhost:5173. Open Overview tab.",
        "Let us now see Domino Sky in action live. We are looking at the Overview dashboard. Our baseline network of 70 flights across 16 airports is operating with 100% on-time performance, zero cancellations, zero missed connections, and normal health.<br/>"
        "Now, let us inject a severe real-world disruption. In the Simulations drawer, I select our flagship benchmark: <b>Mumbai Thunderstorm — 90 minutes</b> (Airport BOM, closure from 08:00 to 09:30). I click 'Run Simulation'."
    )

    add_presentation_block(
        "Move playback scrubber to 09:30. Highlight the Map and Event Log.",
        "Watch the screen. As we scrub through simulated time, Mumbai turns red with an active closure ring. Flights bound for Mumbai enter ground holds.<br/>"
        "Now look at our KPI cards: Network Health has dropped to Moderate. 9 flights are delayed, total delay has jumped to over 540 minutes, and 2 critical connections representing 48 passengers are broken.<br/>"
        "Let us navigate to the Flight Operations table and click on flight <b>DS0502</b>."
    )

    add_presentation_block(
        "Open Flight Inspector Drawer for flight DS0502 (BLR -> COK). Point to Causal DAG.",
        "Examine this flight: DS0502 is flying from Bengaluru (BLR) to Kochi (COK). Both airports have perfect weather! Yet DS0502 is delayed by 35 minutes.<br/>"
        "The Flight Inspector reveals the exact causal DAG: Aircraft VT-DS05 was in Mumbai operating flight DS0501. It was trapped by the closure until 09:30, arriving at BLR at 11:15 (+75 min delay). The engine enforced the mandatory 30-minute turnaround. Ready time became 11:45. The flight could not depart until 11:45 (+35 min delay).<br/>"
        "Because of this, connection CX05 at Kochi is broken, leaving 44 passengers stranded."
    )

    add_presentation_block(
        "Navigate to AI Dispatcher tab. Click 'Get Recovery Recommendations'.",
        "Now, let us act as the OCC Duty Manager. I navigate to the AI Dispatcher and click 'Get Recovery Recommendations'.<br/>"
        "In under one second, the engine evaluates candidates and presents ranked options. Look at Card #1: 'Deploy Spare VT-DS18 to rescue rotation DS0502 onwards'.<br/>"
        "Notice the verified metrics: Saves 380 passenger delay minutes, protects 48 connecting passengers, 0 new crew violations, feasibility status: PASS. Look at the top right: it clearly states 'Source: LLM' or 'Rule-based fallback'. I click 'Apply Recommendation'."
    )

    add_presentation_block(
        "Navigate to Recovery Lab. Show 3-Way Comparison Table.",
        "We are now in the Recovery Lab. The 3-way comparison table displays Baseline vs. Disrupted vs. Recovered.<br/>"
        "Our Network Recovery Score is +72%! Missed connections have dropped back to zero. Flight DS0502 departs on schedule with the spare aircraft.<br/>"
        "If the controller wants to test an alternate strategy, they can click 'Undo', stage manual round-trip cancellations, or take Strategy Snapshots to compare side-by-side. This is operational decision support at its highest level."
    )

    # -------------------------------------------------------------
    # PHASE 7: CODEBASE DEFENSE & Q&A
    # -------------------------------------------------------------
    story.append(PageBreak())
    story.append(Paragraph("Phase 7: Codebase Defense & Technical Q&A Cheatsheet (01:30 – 01:45+)", h1_style))
    story.append(Paragraph("Objective: Master line-by-line questions the technical panel or examiners will ask about the codebase, algorithms, data structures, and edge cases.", body_style))

    qa_list = [
        (
            "Q1: In simulator.py, how does the event loop prevent race conditions when two flights compete for the same airport slot?",
            "Answer: The engine uses global chronological candidate selection. In each iteration of simulate(), candidates are gathered across the next unflown leg of all tails. The engine picks the candidate with min(ready, sched_dep, leg_id). Because this order is globally monotonic and deterministic, whichever flight is ready first queries SlotBook.find(airport, ready, 'dep'). SlotBook checks the hourly bucket capacity. If the slot is free, it is booked immediately. The second flight arrives at SlotBook later in the simulation loop, sees the slot consumed, and is pushed to the next available minute or hour."
        ),
        (
            "Q2: How does the Dijkstra ferry positioning algorithm work in plan.py?",
            "Answer: Function route_graph(net) constructs a directed graph of city pairs using the minimum scheduled block times found in flight_network.json. In ferry_path(net, src, dst), Dijkstra's algorithm finds the shortest flight path from the spare base to the destination. Intermediate stops automatically add the dataset's minimum turnaround (30 minutes). If no path exists along routes the airline actually flies, the deployment is marked infeasible with 'no positioning route found'."
        ),
        (
            "Q3: Why is time stored as integer minutes from midnight IST rather than Python datetime objects?",
            "Answer: In timeutil.py, integer minutes (e.g. 08:30 = 510) provide three massive advantages: 1) Absolute determinism with zero timezone parsing overhead, 2) Complete immunity to floating-point drift, and 3) Clean handling of past-midnight operations. Any flight arriving after midnight simply has minute value >= 1440, formatted as 'HH:MM +1'. The entire simulation runs in pure integer arithmetic."
        ),
        (
            "Q4: What happens if an LLM returns a completely hallucinated recovery action or hallucinated delay numbers?",
            "Answer: In dispatcher/service.py, the LLM is sandboxed. If it returns numeric fields, the parser completely discards them and uses numbers from recovery_search.evaluate_action(). If the LLM proposes an arbitrary action object, it is passed to parse_action() and evaluate_action(). The engine re-simulates the entire day with that action. If the action is infeasible (e.g., spare double-booked, missing crew, invalid aircraft) or if it increases network impact, it is rejected and appended to rejected_proposals. Furthermore, regex unverified_numbers flags any numbers in the LLM's explanation that were not in the prompt."
        ),
        (
            "Q5: How does the engine model crew duty timeout, and how is root cause attributed?",
            "Answer: In simulator.py, each crew's duty begins at duty_start (exactly 45 minutes before their first departure) and has max_duty_mins = 600. Crew duty is calculated as: actual_arrival_of_last_flight - duty_start. If this exceeds 600, a CREW_DUTY_VIOLATION event is recorded. The engine assigns the violation to the final flight and traces its root cause through the rotation parent chain back to the originating disruption."
        ),
        (
            "Q6: Why does single-leg cancellation cause an out-of-position cascade, and how does the engine handle it?",
            "Answer: If flight DS0101 (DEL to JAI) is cancelled, aircraft VT-DS01 remains in DEL. Flight DS0102 is scheduled to depart JAI for DEL. In simulate(), the engine checks if leg.origin == aircraft_location. Here, JAI != DEL. The engine automatically cancels DS0102 with the explanation 'aircraft out of position: cancelled at JAI (aircraft is at DEL)', linked to the parent cancellation. This cascades through all remaining legs of that tail unless a round-trip pair is cancelled."
        ),
        (
            "Q7: How are testing invariants enforced across the backend and frontend?",
            "Answer: Backend tests (tests/test_simulation.py, test_dataset.py, test_recovery.py, test_dispatcher.py) enforce mathematical invariants: test_determinism (same scenario yields identical JSON bytes), test_no_departure_before_aircraft_available_and_min_turn (dep >= prev_arr + 30), test_closed_airport_processes_no_prohibited_movements, and test_llm_numbers_are_ignored_engine_numbers_used. Frontend has Vitest unit tests for display helpers and Playwright E2E tests verifying complete user flows."
        ),
        (
            "Q8: How does the frontend playback controller synchronize the Map, Gantt chart, and Event Log?",
            "Answer: In frontend/src/store/useSim.ts, the store maintains playbackTime in minutes from midnight. The Playback controller increments playbackTime at user-selected speeds (1x, 5x, 15x, 60x). The Map interpolates aircraft position along great circle routes between actual_dep and actual_arr. The Gantt chart renders a vertical cursor at playbackTime. The EventLog filters events to event.timestamp <= playbackTime. All components react synchronously to the same Zustand state."
        ),
        (
            "Q9: What is the computational complexity of the simulation engine?",
            "Answer: For N flight legs, candidate selection takes O(A) where A is the number of active aircraft tails (16). Slot allocation is O(1) amortized using dictionary hour buckets. The full simulation of 70 flights completes in approximately 6 to 9 milliseconds on standard hardware. Candidate recovery search evaluates 30 candidates by running 30 isolated simulations, completing in under 400 milliseconds."
        ),
        (
            "Q10: Can this engine support multiple disruptions simultaneously?",
            "Answer: Yes. simulator.build_windows() accepts an arbitrary list of Disruption objects. Each disruption is converted into an active time window [start, start + duration) at its airport. SlotBook checks all overlapping active windows for any given airport and minute, applying the most restrictive capacity constraint."
        )
    ]

    for q, a in qa_list:
        story.append(Paragraph(q, q_style))
        story.append(Paragraph(a, a_style))

    # Build Document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"PDF successfully built: {filename}")


if __name__ == "__main__":
    out_file = sys.argv[1] if len(sys.argv) > 1 else "DOMINO_SKY_90_MINUTE_PITCH_SCRIPT.pdf"
    build_pdf(out_file)
