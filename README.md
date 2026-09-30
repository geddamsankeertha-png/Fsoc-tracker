FSOC PAT Virtual Camera Tracking Simulator
Autonomous Pointing, Acquisition, and Tracking (PAT) System for Mobile Free-Space Optical Communications
![Image](https://img.shields.io/badge/TypeScript-5.6-blue.svg)
![Image](https://img.shields.io/badge/React-19.0-61dafb.svg)
![Image](https://img.shields.io/badge/Vite-6.2-646cff.svg)
![Image](https://img.shields.io/badge/Tailwind-4.0-38bdf8.svg)
![Image](https://img.shields.io/badge/Unit%20Tests-20%2F20%20Passing-emerald.svg)
![Image](https://img.shields.io/badge/Core%20Benchmark-6%2F6%20Passing-emerald.svg)
1. Executive Summary
Free-Space Optical Communications (FSOC) delivers multi-gigabit per second data transfer across satellite-to-satellite, satellite-to-ground, and airborne mobile nodes using narrow laser carrier beams. Because laser divergence angles are narrow (typically tens of microradians), maintaining optical alignment under platform vibration, atmospheric turbulence, and high-g vehicle dynamics is a major technical challenge.
This project implements an end-to-end, real-time Pointing, Acquisition, and Tracking (PAT) virtual camera simulation and hardware-in-the-loop (HIL) platform. It models the complete physics of optical beacon emission, atmospheric channel distortion, sub-pixel focal plane array (FPA) perception, 4-state predictive Kalman filtering, and dual-axis gimbal visual servoing.
2. System Architecture
code
Code
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              1. OPTICAL EMISSION & ENVIRONMENT                         │
│  • 1 to 5 Optical Beacon Emitters (850nm, 1064nm, 1550nm, 650nm, 532nm)                │
│  • Realistic Orbital & Airborne Flight Kinematics (6 Trajectory Types)                 │
│  • Decoy Flares & Solar Glint Clutter Field                                            │
│  • Environmental Disturbances:                                                         │
│      - Platform Rotor Vibration (18–25 Hz, up to ±5°)                                  │
│      - Kolmogorov Atmospheric Scintillation & Beam Wander                              │
│      - Optical Defocus & Atmospheric Fog Attenuation                                   │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              2. SENSOR INGESTION & PERCEPTION                          │
│  • Dual-Path Ingestion: High-Rate Synthetic FPA Canvas (1280x720) OR Physical Webcam   │
│  • Tri-Mode Centroiding Engine:                                                        │
│      1. Intensity-Weighted Center of Gravity (CoG) with Noise Floor Thresholding       │
│      2. 2D Elliptical Gaussian Surface Fitting (Sub-pixel Beam Distortion Recovery)    │
│      3. Deep Neural Spatial Centroid Network (Multi-Decoy Discrimination)              │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │ [Centroid (x, y), Intensity, SNR, Confidence]
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              3. STATE ESTIMATION & PREDICTION                          │
│  • 4-State Discrete Linear Kalman Filter (x_k = [pos_x, vel_x, pos_y, vel_y]^T)        │
│  • Closed-Form Latency Compensation (Lookahead τ = 16–33 ms)                           │
│  • Dead Reckoning during Total Optical Occlusion & Scintillation Drops                 │
│  • Innovation Residual Gating to Reject Spurious Decoy Centroids                       │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │ [Predicted Target Angle & Velocity Rates]
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              4. PAT SERVO CONTROL & GIMBAL KINEMATICS                  │
│  • Closed-Loop Dual-Axis PID Controller with Anti-Windup Integrator Clamping           │
│  • Low-Pass Filtered Derivative Term (Rejects High-Frequency Rotor Harmonics)          │
│  • Inertial Target Velocity Feedforward Injection (Zero Steady-State Tracking Lag)     │
│  • Actuator Dynamics: Slew Rate Limits (45°/s), Acceleration Limits, First-Order Lag   │
│  • 4-State Acquisition FSM: [ SEARCHING ──> ACQUIRING ──> LOCKED ──> RECOVERY ]       │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              5. TELEMETRY, BENCHMARKING & EXPLAINABILITY               │
│  • 60 FPS Synthetic Camera HUD with Optical Boresight Reticle & Error Vectors          │
│  • Interactive 3D Celestial Tactical Sphere Viewport                                   │
│  • Real-Time Time-Series Charts (Pointing Error, Kalman Residuals, Link Margin dB)    │
│  • 6-Test Aerospace Verification Suite & 360-Run Monte Carlo Sweep                     │
│  • Frame-by-Frame Tracking Replay Scrubber & Automated Engineering PDF Exporter       │
└────────────────────────────────────────────────────────────────────────────────────────┘
3. Mathematical & Control Formulation
3.1. Optical Centroiding (Center of Gravity)
The sensor measures irradiance on a 2D Focal Plane Array (FPA). In Intensity Mode, the sub-pixel centroid 
 is computed as:

where 
 is the raw pixel intensity and 
 is the adaptive noise threshold.
3.2. Optical & Mechanical Pointing Error
Optical Error (
): Instantaneous angular offset between the sensor optical axis and the received beacon spot on the detector array:
Mechanical Pointing Error (
): The physical alignment of the gimbal axis relative to the true target inertial line-of-sight (LOS), isolating high-frequency platform vibration jitter from the mechanical boresight:
3.3. 4-State Predictive Kalman Filter
The discrete state vector represents target screen-space position and velocity:
State Transition:
Measurement Model:
Lookahead Prediction (Latency Compensation):
Dead Reckoning: When 
 is unavailable (during occlusions or deep fades), the measurement update step is skipped, allowing state propagation via 
.
3.4. Feedforward-Augmented PID Gimbal Controller
The rate command 
 applied to the gimbal actuators is:

where:
 is the angular error on the given axis.
 is the low-pass filtered error derivative: 
, attenuating sensor noise and platform vibration above 
.
 is the feedforward velocity term, driving steady-state tracking error to near zero for moving targets.
Rate commands are saturated to 
 with anti-windup clamping on the integral term.
4. Key Features & Modes
4.1. Dual Operational Modes
Virtual Space Simulation Mode (#sim):
6 flight trajectories: Circular, Sinusoidal, Figure-8, Evasive (high-g reversals), Linear Flyby, and Orbital Keplerian.
Dynamic disturbance injection: rotor harmonics (
), Kolmogorov scintillation, fog attenuation, and optical defocus.
Live Hardware-in-the-Loop Webcam Mode (#webcam):
Directly connects to a standard USB webcam or external sensor.
Real-time sub-pixel laser/LED beacon detection, Kalman filtering, and simulated gimbal tracking on live camera frames.
4.2. Multi-Beacon Formation & Target Carrier Selection
Beacons in Frame (1 to 5): Fly up to 5 simultaneous optical emitters to simulate constellation crosslinks, friendly wingmen, or multi-channel links.
Track Target: Operator can toggle active tracking between:
Beacon 1 (Alpha): 
 Near-IR (
 modulation)
Beacon 2 (Beta): 
 Nd:YAG Laser (
 modulation)
Beacon 3 (Gamma): 
 Telecom C-Band (
 modulation)
Beacon 4 (Delta): 
 Red Visible (
 modulation)
Beacon 5 (Epsilon): 
 Green Visible (
 modulation)
The gimbal initiates a smooth coarse-to-fine slew upon target carrier reselection.
4.3. Automated Verification Suites
6-Test Core Benchmark Suite:
Static Target Acquisition: Slew from 
 offset to lock (
 RMS).
Smooth Orbital Tracking: Nominal orbital kinematic tracking (
 RMS).
High-Speed Evasive Flight: High-g reversals at 
 speed (
 RMS).
Airframe Rotor Vibration Rejection: 
 jitter at 
 (
 RMS).
Deep Atmospheric Scintillation & Fog: Low SNR, 
 fog, 
 turbulence (
 RMS).
Multi-Beacon Clutter & Decoys: 4 decoys + multiple emitters (
 RMS).
360-Run Monte Carlo Sweep: Sweeps across randomized seeds, initial pointing offsets, noise levels, and speeds for statistical robustness validation.
5. Repository Structure
code
Code
.
├── src/
│   ├── components/
│   │   ├── LandingPage.tsx                # Mission overview, pipeline architecture & launch cards
│   │   ├── ControlDashboard.tsx           # Full telemetry & disturbance control tabs
│   │   ├── SyntheticCameraFeed.tsx        # 60 FPS Canvas FPA display, HUD reticle & beacon bar
│   │   ├── SpatialTacticalView.tsx        # 3D Celestial sphere tactical projection
│   │   ├── LiveWebcamView.tsx             # Hardware-in-the-loop webcam tracking view
│   │   ├── TelemetryStripCharts.tsx       # Live strip charts (Pan/Tilt, Residuals, Link Margin)
│   │   ├── BenchmarkEvaluationModal.tsx   # 6 Core benchmark tests & 360-run Monte Carlo sweep
│   │   ├── TrackingExplainabilityPanel.tsx# Mathematical equations & FSM state inspectability
│   │   ├── TrackingReplayModal.tsx        # Frame-by-frame post-flight scrubber & diagnostics
│   │   ├── TrackingStepsModal.tsx         # Detailed 4-stage algorithmic walkthrough
│   │   ├── CameraGeometryModal.tsx        # Optics, FOV, and sensor calibration parameters
│   │   ├── PerformanceReportModal.tsx     # Comprehensive flight report & export tools
│   │   └── PerformanceLogPanel.tsx        # Live event log (FSM state changes, link dropouts)
│   ├── simulation/
│   │   ├── simulationEngine.ts            # Core physics, Kalman filter, PID gimbal controller & FSM
│   │   ├── webcamEngine.ts                # Real-time computer vision processor for webcam video
│   │   └── inertialFeedforwardLock.test.ts# 20-test verification suite for feedforward & lock logic
│   ├── App.tsx                            # Top-level routing, hash navigation & viewport layouts
│   ├── main.tsx                           # Application entry point
│   └── types.ts                           # Comprehensive TypeScript domain types & interfaces
├── public/                                # Static images and demonstration media assets
├── index.html                             # Web application entry point
├── package.json                           # Dependencies, build scripts & test commands
├── tsconfig.json                          # TypeScript configuration
└── vite.config.ts                         # Vite bundler configuration
6. Installation & Local Development
6.1. Prerequisites
Node.js: v18.0.0 or v20+ recommended
npm (comes with Node.js) or bun
6.2. Quick Start
code
Bash
# 1. Clone the repository and navigate into the root directory
git clone <repository-url>
cd fsoc-pat-tracker

# 2. Install all dependencies
npm install

# 3. Start the development server
npm run dev
Open your browser at http://localhost:3000.
6.3. Running Tests & Quality Checks
code
Bash
# Run the 20-test focused unit suite (Feedforward, Kalman, Lock Logic)
npm test

# Type-check and lint the TypeScript codebase
npm run lint

# Production build test
npm run build
7. Operational URL Navigation
The platform supports browser hash routing for direct navigation:
http://localhost:3000/#landing — Mission Overview & Architecture Landing Page
http://localhost:3000/#sim — 6-DOF Virtual Space Simulation Mode
http://localhost:3000/#webcam — Hardware-in-the-Loop Real Webcam Tracking Mode
8. Standards & References
CCSDS 141.0-B-1: Optical Communications Physical Layer (Blue Book).
CCSDS 142.0-B-1: Optical Communications Coding & Synchronization.
NASA / ESA FSOC PAT Guidelines: Sub-microradian optical terminal tracking specifications.