import React, { useRef, useEffect, useState, useCallback } from 'react';
import { WebcamTrackingEngine } from '../simulation/webcamTrackingEngine';
import { PerceptionMode, TrackingStatus } from '../types';
import {
  Camera,
  Play,
  Square,
  RotateCcw,
  Sliders,
  Crosshair,
  ShieldAlert,
  Zap,
  Layers,
  AlertTriangle,
  Settings,
  Eye,
  Activity,
  Compass,
  Download,
  CheckCircle2,
  HelpCircle,
  Filter,
} from 'lucide-react';
import { TrackingExplainabilityPanel } from './TrackingExplainabilityPanel';
import { TrackingStepsModal } from './TrackingStepsModal';
import { CameraGeometryModal } from './CameraGeometryModal';
import { TrackingReplayModal } from './TrackingReplayModal';

interface LiveWebcamViewProps {
  engine: WebcamTrackingEngine;
}

export const LiveWebcamView: React.FC<LiveWebcamViewProps> = ({ engine }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [selectedResolution, setSelectedResolution] = useState<string>('1280x720');
  const [selectedFps, setSelectedFps] = useState<number>(30);
  const [showOverlays, setShowOverlays] = useState<boolean>(true);
  const [showKalmanVector, setShowKalmanVector] = useState<boolean>(true);
  const [showCalibrationPanel, setShowCalibrationPanel] = useState<boolean>(false);
  const [showDisturbancesPanel, setShowDisturbancesPanel] = useState<boolean>(false);
  const [showFilterPanel, setShowFilterPanel] = useState<boolean>(false);
  const [showPidPanel, setShowPidPanel] = useState<boolean>(false);
  const [colorTheme, setColorTheme] = useState<'cyan' | 'emerald' | 'amber'>('cyan');
  const [sensorViewMode, setSensorViewMode] = useState<'explainability' | 'normal' | 'gate' | 'mask'>('explainability');
  const [showHowItTracksModal, setShowHowItTracksModal] = useState<boolean>(false);
  const [showGeometryModal, setShowGeometryModal] = useState<boolean>(false);
  const [showReplayModal, setShowReplayModal] = useState<boolean>(false);
  const [, setTick] = useState(0);

  // Smooth telemetry polling interval for React cards & badges during live streaming (10 FPS)
  useEffect(() => {
    if (!engine.isStreaming) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 100);
    return () => clearInterval(interval);
  }, [engine.isStreaming]);

  // Load available camera devices on mount
  useEffect(() => {
    engine.enumerateCameras().then((devs) => {
      const cameraList = devs || [];
      setCameras(cameraList);
      if (cameraList.length > 0 && !selectedCamera) {
        setSelectedCamera(cameraList[0].deviceId);
      }
    }).catch(() => {
      setCameras([]);
    });
  }, [engine, selectedCamera]);

  const handleStartWebcam = async () => {
    const [w, h] = selectedResolution.split('x').map(Number);
    await engine.startWebcam(selectedCamera || undefined, w, h, selectedFps);
    setTick((t) => t + 1);
  };

  const handleStopWebcam = () => {
    engine.stopWebcam();
    setTick((t) => t + 1);
  };

  const handleReset = () => {
    engine.reset();
    setTick((t) => t + 1);
  };

  // Main rendering loop for live webcam HUD
  useEffect(() => {
    let animId: number;

    const renderLoop = () => {
      // Process live frame from webcam
      if (engine.isStreaming) {
        engine.processFrame();
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          const cx = w / 2;
          const cy = h / 2;

          const theme = {
            cyan: {
              hud: '#38bdf8',
              hudDim: 'rgba(56, 189, 248, 0.4)',
              grid: 'rgba(56, 189, 248, 0.08)',
              lock: '#10b981',
              errorLine: '#f59e0b',
            },
            emerald: {
              hud: '#10b981',
              hudDim: 'rgba(16, 185, 129, 0.4)',
              grid: 'rgba(16, 185, 129, 0.08)',
              lock: '#34d399',
              errorLine: '#fbbf24',
            },
            amber: {
              hud: '#f59e0b',
              hudDim: 'rgba(245, 158, 11, 0.4)',
              grid: 'rgba(245, 158, 11, 0.08)',
              lock: '#10b981',
              errorLine: '#ef4444',
            },
          }[colorTheme];

          // 1. Draw live webcam frame or standby background
          if (engine.isStreaming && engine.videoElement && engine.videoElement.readyState >= 2) {
            ctx.drawImage(engine.videoElement, 0, 0, w, h);

            // Optional software disturbance overlay indication
            if (engine.disturbances.enabled) {
              ctx.fillStyle = 'rgba(239, 68, 68, 0.06)';
              ctx.fillRect(0, 0, w, h);
            }
          } else {
            // Standby pattern
            ctx.fillStyle = '#050911';
            ctx.fillRect(0, 0, w, h);

            // Grid lines
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.lineWidth = 1;
            for (let x = 0; x <= w; x += 60) {
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, h);
              ctx.stroke();
            }
            for (let y = 0; y <= h; y += 60) {
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(w, y);
              ctx.stroke();
            }

            // Standby prompt
            ctx.fillStyle = '#64748b';
            ctx.font = '14px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(
              engine.isInitializing
                ? 'INITIALIZING REAL-TIME OPTICAL WEBCAM SENSOR...'
                : 'CAMERA STANDBY — CLICK "START WEBCAM" TO ACTIVATE LIVE TRACKING',
              cx,
              cy - 10
            );
            ctx.font = '11px JetBrains Mono, monospace';
            ctx.fillStyle = '#475569';
            ctx.fillText('Demonstrator Target: Phone Flashlight, Bright LED, or Laser Spot', cx, cy + 18);
            ctx.textAlign = 'left';
          }

          // 2. Optical Center Reticle & Link Acceptance Cone (<1.80°)
          if (showOverlays) {
            const fx = (w / 2) / Math.tan((engine.config.fovXDeg * Math.PI) / 360);
            const lockTolerancePx = Math.max(20, fx * Math.tan((1.80 * Math.PI) / 180));
            const fineTolerancePx = Math.max(8, fx * Math.tan((0.50 * Math.PI) / 180));

            // Coarse Lock Acceptance Cone Ring
            ctx.strokeStyle = engine.fsmState === 'LOCKED' ? theme.lock : theme.hudDim;
            ctx.lineWidth = engine.fsmState === 'LOCKED' ? 2.0 : 1.2;
            ctx.beginPath();
            ctx.arc(cx, cy, lockTolerancePx, 0, Math.PI * 2);
            ctx.stroke();

            // Fine Core Reticle
            ctx.strokeStyle = engine.fsmState === 'LOCKED' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(56, 189, 248, 0.25)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(cx, cy, fineTolerancePx, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Label for lock cone
            ctx.fillStyle = engine.fsmState === 'LOCKED' ? theme.lock : theme.hudDim;
            ctx.font = '9px JetBrains Mono, monospace';
            ctx.fillText('1.80° PAT LINK CONE', cx + lockTolerancePx + 6, cy - 4);

            // Center crosshair: + CENTER BORESIGHT
            ctx.strokeStyle = theme.hud;
            ctx.lineWidth = 1.4;
            const crossLen = 18;
            const gap = 5;

            ctx.beginPath();
            ctx.moveTo(cx - crossLen - gap, cy);
            ctx.lineTo(cx - gap, cy);
            ctx.moveTo(cx + gap, cy);
            ctx.lineTo(cx + crossLen + gap, cy);
            ctx.moveTo(cx, cy - crossLen - gap);
            ctx.lineTo(cx, cy - gap);
            ctx.moveTo(cx, cy + gap);
            ctx.lineTo(cx, cy + crossLen + gap);
            ctx.stroke();

            // Center precision dot
            ctx.fillStyle = theme.hud;
            ctx.beginPath();
            ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Explicit Center Tag
            ctx.fillStyle = theme.hud;
            ctx.font = 'bold 10px JetBrains Mono, monospace';
            ctx.fillText(`+ CENTER (${cx}, ${cy})`, cx + 12, cy - 8);
          }

          // 3. Render Detected Optical Target (Bounding Box, Centroid & Intelligent Non-Overlapping Label)
          const det = engine.currentDetection;
          if (det.detected && det.centroid && det.boundingBox) {
            const box = det.boundingBox;
            const isPAT = det.modeUsed === 'kalman_predictive';
            const isNeural = det.modeUsed === 'ai_neural';
            const isLocked = engine.fsmState === 'LOCKED';
            const boxColor = isLocked ? '#10b981' : (isPAT ? '#34d399' : (isNeural ? '#38bdf8' : '#eab308'));

            ctx.strokeStyle = boxColor;
            ctx.lineWidth = isLocked ? 2 : 1.5;

            // Bracket corners with safe margin around target light emitter
            const cl = Math.min(10, Math.max(6, box.width * 0.25));
            ctx.beginPath();
            // Top-left
            ctx.moveTo(box.x, box.y + cl);
            ctx.lineTo(box.x, box.y);
            ctx.lineTo(box.x + cl, box.y);
            // Top-right
            ctx.moveTo(box.x + box.width - cl, box.y);
            ctx.lineTo(box.x + box.width, box.y);
            ctx.lineTo(box.x + box.width, box.y + cl);
            // Bottom-left
            ctx.moveTo(box.x, box.y + box.height - cl);
            ctx.lineTo(box.x, box.y + box.height);
            ctx.lineTo(box.x + cl, box.y + box.height);
            // Bottom-right
            ctx.moveTo(box.x + box.width - cl, box.y + box.height);
            ctx.lineTo(box.x + box.width, box.y + box.height);
            ctx.lineTo(box.x + box.width, box.y + box.height - cl);
            ctx.stroke();

            // Target Centroid Point & Pulsing Halo
            ctx.fillStyle = boxColor;
            ctx.beginPath();
            ctx.arc(det.centroid.x, det.centroid.y, 3, 0, Math.PI * 2);
            ctx.fill();

            // Calibrated concentric lock ring when locked
            if (isLocked) {
              ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.arc(det.centroid.x, det.centroid.y, Math.max(14, (box.width + box.height) / 3.5), 0, Math.PI * 2);
              ctx.stroke();
            }

            // INTELLIGENT NON-OVERLAPPING BEACON LABEL
            // Calculates label placement so it never clips canvas boundaries and never obscures the optical light source
            const algTag = isPAT ? 'AI+KALMAN (PAT)' : (isNeural ? 'AI NEURAL' : 'CLASSICAL CV');
            const labelText = `● BEACON: ${algTag} · ${(det.confidence * 100).toFixed(0)}%`;
            
            ctx.font = 'bold 10px JetBrains Mono, monospace';
            const textMetrics = ctx.measureText(labelText);
            const badgeW = textMetrics.width + 16;
            const badgeH = 18;

            // Vertical smart placement: if target is near top edge, place label below box; otherwise place above
            let badgeY = box.y - badgeH - 6;
            if (box.y < badgeH + 12) {
              badgeY = box.y + box.height + 8;
            }
            if (badgeY + badgeH > h - 12) {
              badgeY = h - badgeH - 12;
            }

            // Horizontal smart clamping: keep completely inside viewport
            let badgeX = box.x + (box.width - badgeW) / 2;
            badgeX = Math.max(12, Math.min(w - badgeW - 12, badgeX));

            // Draw protective obsidian background badge for 100% legibility
            ctx.fillStyle = 'rgba(3, 7, 18, 0.92)';
            ctx.strokeStyle = boxColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
            } else {
              ctx.rect(badgeX, badgeY, badgeW, badgeH);
            }
            ctx.fill();
            ctx.stroke();

            // Label text inside badge
            ctx.fillStyle = boxColor;
            ctx.textAlign = 'left';
            ctx.fillText(labelText, badgeX + 8, badgeY + 13);

            // 4. Pointing Error Vector (from optical center to target)
            const distToCenter = Math.hypot(det.centroid.x - cx, det.centroid.y - cy);
            if (showOverlays && distToCenter > 3) {
              ctx.strokeStyle = isLocked ? 'rgba(16, 185, 129, 0.7)' : '#f59e0b';
              ctx.lineWidth = isLocked ? 1.5 : 1.2;
              ctx.setLineDash([4, 4]);
              ctx.beginPath();
              ctx.moveTo(cx, cy);
              ctx.lineTo(det.centroid.x, det.centroid.y);
              ctx.stroke();
              ctx.setLineDash([]);

              // Angular error readout along vector (only when distToCenter > 45px to avoid cluttering reticle)
              if (distToCenter > 45) {
                const midX = (cx + det.centroid.x) / 2;
                const midY = (cy + det.centroid.y) / 2;
                const normX = -(det.centroid.y - cy) / distToCenter;
                const normY = (det.centroid.x - cx) / distToCenter;

                const ang = engine.pixelToAngular(det.centroid.x, det.centroid.y);
                const dx = Math.round(det.centroid.x - cx);
                const dy = Math.round(det.centroid.y - cy);
                const errText = `Δ [${dx >= 0 ? '+' : ''}${dx}px, ${dy >= 0 ? '+' : ''}${dy}px] · θ: ${ang.totalAngularDeg.toFixed(2)}° (${ang.totalAngularMrad.toFixed(1)} mrad)`;

                ctx.font = 'bold 9px JetBrains Mono, monospace';
                const errMetrics = ctx.measureText(errText);
                const errBadgeW = errMetrics.width + 12;
                const errBadgeH = 16;

                let errBadgeX = midX + normX * 18 - errBadgeW / 2;
                let errBadgeY = midY + normY * 18 - errBadgeH / 2;
                errBadgeX = Math.max(12, Math.min(w - errBadgeW - 12, errBadgeX));
                errBadgeY = Math.max(36, Math.min(h - errBadgeH - 36, errBadgeY));

                ctx.fillStyle = 'rgba(3, 7, 18, 0.88)';
                ctx.beginPath();
                if (ctx.roundRect) {
                  ctx.roundRect(errBadgeX, errBadgeY, errBadgeW, errBadgeH, 3);
                } else {
                  ctx.rect(errBadgeX, errBadgeY, errBadgeW, errBadgeH);
                }
                ctx.fill();

                ctx.fillStyle = isLocked ? '#34d399' : '#fbbf24';
                ctx.fillText(errText, errBadgeX + 6, errBadgeY + 11);
              }
            }

            // Draw candidate clutter spots if any
            if (det.candidates && det.candidates.length > 1) {
              det.candidates.slice(1).forEach((cand) => {
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(cand.x, cand.y, 6, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
                ctx.font = '8px JetBrains Mono, monospace';
                ctx.fillText(`CAND ${cand.id}`, cand.x + 8, cand.y - 2);
              });
            }
          }

          // 3b. When streaming and no optical light is detected (background strictly rejected)
          if (engine.isStreaming && (!det.detected || !det.centroid)) {
            const scanMsg = '● SCANNING FOR OPTICAL LIGHT SOURCE';
            const subMsg = 'Background filtered out — point phone flashlight, LED, or laser spot at camera';

            ctx.font = 'bold 11px JetBrains Mono, monospace';
            const scanW = ctx.measureText(scanMsg).width + 24;

            ctx.fillStyle = 'rgba(3, 7, 18, 0.88)';
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(cx - scanW / 2, cy + 24, scanW, 40, 6);
            else ctx.rect(cx - scanW / 2, cy + 24, scanW, 40);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#f59e0b';
            ctx.textAlign = 'center';
            ctx.fillText(scanMsg, cx, cy + 40);
            ctx.font = '10px JetBrains Mono, monospace';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(subMsg, cx, cy + 54);
            ctx.textAlign = 'left';
          }

          // 5. Kalman Prediction Vector & Lookahead Indicator: ◇ PREDICTED
          const kState = engine.kalmanFilter.getState();
          if (showKalmanVector && kState.isInitialized && (det.detected || engine.fsmState === 'COASTING')) {
            const predAhead = engine.kalmanFilter.predictAhead(0.025); // 25ms forward lookahead
            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(kState.x, kState.y);
            ctx.lineTo(predAhead.x, predAhead.y);
            ctx.stroke();

            // Predicted point: ◇ PREDICTED diamond glyph
            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(predAhead.x, predAhead.y - 6);
            ctx.lineTo(predAhead.x + 6, predAhead.y);
            ctx.lineTo(predAhead.x, predAhead.y + 6);
            ctx.lineTo(predAhead.x - 6, predAhead.y);
            ctx.closePath();
            ctx.stroke();
            ctx.fillStyle = '#a855f7';
            ctx.fill();

            // Intelligent placement for Kalman Prediction label with dark protective badge
            const predText = `◇ PREDICTED T+25ms (${predAhead.x.toFixed(0)}, ${predAhead.y.toFixed(0)})`;
            ctx.font = 'bold 9px JetBrains Mono, monospace';
            const predMetrics = ctx.measureText(predText);
            const predBadgeW = predMetrics.width + 10;
            const predBadgeH = 16;

            let predBadgeX = predAhead.x + 10;
            if (predBadgeX + predBadgeW > w - 12) {
              predBadgeX = predAhead.x - predBadgeW - 10;
            }
            predBadgeX = Math.max(12, Math.min(w - predBadgeW - 12, predBadgeX));
            const predBadgeY = Math.max(30, Math.min(h - predBadgeH - 20, predAhead.y - predBadgeH / 2));

            ctx.fillStyle = 'rgba(3, 7, 18, 0.88)';
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(predBadgeX, predBadgeY, predBadgeW, predBadgeH, 3);
            else ctx.rect(predBadgeX, predBadgeY, predBadgeW, predBadgeH);
            ctx.fill();

            ctx.fillStyle = '#e9d5ff';
            ctx.fillText(predText, predBadgeX + 5, predBadgeY + 11);

            // Kalman Search ROI / Track Gate (bounding box around predicted position)
            if (sensorViewMode === 'gate' || sensorViewMode === 'explainability') {
              const gateRadius = Math.max(24, Math.min(80, kState.covarianceTrace * 0.7));
              ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);
              ctx.strokeRect(predAhead.x - gateRadius, predAhead.y - gateRadius, gateRadius * 2, gateRadius * 2);
              ctx.setLineDash([]);
              ctx.fillStyle = 'rgba(168, 85, 247, 0.7)';
              ctx.font = '9px JetBrains Mono, monospace';
              ctx.fillText('KALMAN GATE', predAhead.x - gateRadius + 4, predAhead.y - gateRadius - 4);
            }
          }

          // 5b. Position Filter Smoothed Indicator (EWMA / Hybrid)
          if (showOverlays && engine.smoothedPosition && engine.positionFilterMode !== 'raw') {
            const sm = engine.smoothedPosition;
            ctx.strokeStyle = '#06b6d4';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(sm.x, sm.y, 6, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = '#22d3ee';
            ctx.beginPath();
            ctx.arc(sm.x, sm.y, 2.5, 0, Math.PI * 2);
            ctx.fill();

            const filtText = `◉ FILTERED [${engine.positionFilterMode.toUpperCase()}] (${sm.x.toFixed(0)}, ${sm.y.toFixed(0)}) -${engine.filterResidualPx.toFixed(1)}px jitter`;
            ctx.font = 'bold 9px JetBrains Mono, monospace';
            const filtMetrics = ctx.measureText(filtText);
            const filtW = filtMetrics.width + 10;
            const filtH = 16;

            let filtX = sm.x + 10;
            if (filtX + filtW > w - 12) filtX = sm.x - filtW - 10;
            filtX = Math.max(12, Math.min(w - filtW - 12, filtX));
            const filtY = Math.max(30, Math.min(h - filtH - 20, sm.y + 10));

            ctx.fillStyle = 'rgba(3, 7, 18, 0.88)';
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(filtX, filtY, filtW, filtH, 3);
            else ctx.rect(filtX, filtY, filtW, filtH);
            ctx.fill();

            ctx.fillStyle = '#67e8f9';
            ctx.fillText(filtText, filtX + 5, filtY + 11);
          }

          // 6. Optional Evaluation Reference Marker (Physical Ground Truth Measurement)
          if (engine.evalReference.enabled && engine.evalReference.detected) {
            const rx = engine.evalReference.screenX;
            const ry = engine.evalReference.screenY;

            ctx.strokeStyle = '#06b6d4';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(rx - 15, ry - 15, 30, 30);

            ctx.fillStyle = '#06b6d4';
            ctx.beginPath();
            ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.font = 'bold 9px JetBrains Mono, monospace';
            ctx.fillText('EVALUATION REFERENCE (GROUND TRUTH)', rx - 50, ry - 20);

            if (engine.evalReference.trueTrackingErrorDeg !== null) {
              ctx.fillStyle = '#22d3ee';
              ctx.fillText(
                `REAL ERROR: ${engine.evalReference.trueTrackingErrorDeg.toFixed(3)}° (${engine.evalReference.trueTrackingErrorMrad} mrad)`,
                rx - 50,
                ry + 28
              );
            }
          }

          // 7. FSM State Banners with Protective High-Legibility Badges
          if (engine.fsmState === 'COASTING') {
            const msg = '⚠ BEACON LOSS — COASTING ON KALMAN VELOCITY LOOKAHEAD';
            ctx.font = 'bold 11px JetBrains Mono, monospace';
            const mW = ctx.measureText(msg).width + 24;
            ctx.fillStyle = 'rgba(3, 7, 18, 0.92)';
            ctx.strokeStyle = 'rgba(234, 179, 8, 0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(cx - mW / 2, 48, mW, 24, 4);
            else ctx.rect(cx - mW / 2, 48, mW, 24);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fbbf24';
            ctx.textAlign = 'center';
            ctx.fillText(msg, cx, 64);
            ctx.textAlign = 'left';
          } else if (engine.fsmState === 'REACQUIRING') {
            const msg = '⚡ BEACON RE-DETECTED — REACQUIRING COARSE OPTICAL LOCK...';
            ctx.font = 'bold 11px JetBrains Mono, monospace';
            const mW = ctx.measureText(msg).width + 24;
            ctx.fillStyle = 'rgba(3, 7, 18, 0.92)';
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(cx - mW / 2, 48, mW, 24, 4);
            else ctx.rect(cx - mW / 2, 48, mW, 24);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#38bdf8';
            ctx.textAlign = 'center';
            ctx.fillText(msg, cx, 64);
            ctx.textAlign = 'left';
          } else if (engine.fsmState === 'LOCKED') {
            const msg = '● OPTICAL LINK LOCKED (<1.80° PAT CONE)';
            ctx.font = 'bold 11px JetBrains Mono, monospace';
            const mW = ctx.measureText(msg).width + 24;
            ctx.fillStyle = 'rgba(3, 7, 18, 0.92)';
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(cx - mW / 2, 48, mW, 24, 4);
            else ctx.rect(cx - mW / 2, 48, mW, 24);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#34d399';
            ctx.textAlign = 'center';
            ctx.fillText(msg, cx, 64);
            ctx.textAlign = 'left';
          }
        }
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [engine, showOverlays, showKalmanVector, colorTheme]);

  const tele = engine.currentTelemetry;

  const getStatusBadge = (status: TrackingStatus) => {
    switch (status) {
      case 'LOCKED':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse';
      case 'TRACKING':
        return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40';
      case 'REACQUIRING':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40 animate-pulse';
      case 'ACQUIRING':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'COASTING':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40 animate-pulse';
      case 'SEARCHING':
        return 'bg-slate-700/30 text-slate-400 border-slate-700/50';
      case 'LOST':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
    }
  };

  return (
    <div id="live-webcam-container" className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Top Header & Stream Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-950/90 border-b border-slate-800 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-2">
          {/* Start/Stop Button */}
          {!engine.isStreaming ? (
            <button
              id="btn-start-webcam"
              onClick={handleStartWebcam}
              disabled={engine.isInitializing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{engine.isInitializing ? 'INITIALIZING...' : 'START WEBCAM'}</span>
            </button>
          ) : (
            <button
              id="btn-stop-webcam"
              onClick={handleStopWebcam}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 font-bold transition-all shadow cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>STOP WEBCAM</span>
            </button>
          )}

          <button
            id="btn-reset-webcam-tracker"
            onClick={handleReset}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET</span>
          </button>

          {/* Quick Drop / Obstruct Button */}
          <button
            id="btn-test-dropout"
            onClick={() => {
              engine.disturbances.dropoutActive = !engine.disturbances.dropoutActive;
              setTick((t) => t + 1);
            }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
              engine.disturbances.dropoutActive
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Simulate beacon occlusion / cloud dropout to test Kalman coasting"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>{engine.disturbances.dropoutActive ? 'SIGNAL DROPOUT ACTIVE' : 'OBSTRUCT BEAM'}</span>
          </button>

          {/* Camera Selection Dropdown */}
          <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
            <Camera className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
              disabled={engine.isStreaming}
              className="bg-transparent text-slate-300 outline-none text-xs cursor-pointer max-w-[130px] sm:max-w-[180px] truncate"
            >
              {(cameras || []).length === 0 ? (
                <option value="">Default / Auto Camera</option>
              ) : (
                cameras.map((cam, idx) => (
                  <option key={cam.deviceId || idx} value={cam.deviceId} className="bg-slate-900 text-slate-200">
                    {cam.label || `Camera ${idx + 1}`}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Resolution Dropdown */}
          <select
            value={selectedResolution}
            onChange={(e) => setSelectedResolution(e.target.value)}
            disabled={engine.isStreaming}
            className="bg-slate-950 text-slate-300 px-2 py-1 rounded-lg border border-slate-800 outline-none text-xs cursor-pointer"
          >
            <option value="640x480">640 × 480 (SD)</option>
            <option value="1280x720">1280 × 720 (HD)</option>
            <option value="1920x1080">1920 × 1080 (FHD)</option>
          </select>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          {/* Perception Mode Selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => {
                engine.perceptionMode = 'classical_cv';
                setTick((t) => t + 1);
              }}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                engine.perceptionMode === 'classical_cv'
                  ? 'bg-yellow-500/25 text-yellow-400 border border-yellow-500/50 shadow-sm font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Classical Computer Vision: Intensity thresholding & sub-pixel centroid"
            >
              Classical CV
            </button>
            <button
              onClick={() => {
                engine.perceptionMode = 'ai_neural';
                setTick((t) => t + 1);
              }}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                engine.perceptionMode === 'ai_neural'
                  ? 'bg-cyan-500/25 text-cyan-400 border border-cyan-500/50 shadow-sm font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="AI Neural: Deep Vision MLP classifier & optical PSF feature extraction"
            >
              AI Neural
            </button>
            <button
              onClick={() => {
                engine.perceptionMode = 'kalman_predictive';
                setTick((t) => t + 1);
              }}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                engine.perceptionMode === 'kalman_predictive'
                  ? 'bg-emerald-500/25 text-emerald-400 border border-emerald-500/50 shadow-sm font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="AI + Kalman (PAT): Neural detector + 4-state Kalman predictor + forward lookahead + coasting"
            >
              AI + Kalman (PAT)
            </button>
          </div>

          {/* Toggle Panels */}
          <button
            onClick={() => setShowDisturbancesPanel(!showDisturbancesPanel)}
            className={`p-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
              showDisturbancesPanel || engine.disturbances.enabled
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Controlled Live Software Disturbances (Noise, Blur, Vibration)"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setShowCalibrationPanel(!showCalibrationPanel)}
            className={`p-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
              showCalibrationPanel
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Camera Calibration (FOV, Principal Point, Radial Distortion)"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* Position Filter (EWMA / Kalman / Buffering Guard) */}
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
              showFilterPanel || engine.positionFilterMode !== 'raw'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Position Estimation & Noise Filtering (Kalman / EWMA / Buffering Protection)"
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono uppercase font-semibold">{engine.positionFilterMode}</span>
          </button>

          {/* PID Gimbal Tuning Panel Toggle */}
          <button
            onClick={() => setShowPidPanel(!showPidPanel)}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
              showPidPanel
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm font-bold'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Closed-Loop Gimbal PID Gains & Velocity Feedforward Tuning"
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono font-semibold">PID</span>
          </button>
        </div>
      </div>

      {/* Camera Error Banner */}
      {engine.error && (
        <div className="px-4 py-2 bg-rose-950/80 border-b border-rose-800 text-rose-300 text-xs font-mono flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{engine.error}</span>
        </div>
      )}

      {/* Collapsible Software Disturbances Panel */}
      {showDisturbancesPanel && (
        <div className="p-4 bg-slate-950/95 border-b border-slate-800 text-xs font-mono space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-rose-400 uppercase tracking-wide">
                LIVE CAMERA + SOFTWARE DISTURBANCE (Section 5 Testing)
              </span>
              <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                Approximation
              </span>
            </div>
            <button
              onClick={() => {
                engine.disturbances.enabled = !engine.disturbances.enabled;
                setTick((t) => t + 1);
              }}
              className={`px-3 py-1 rounded font-bold transition-colors cursor-pointer ${
                engine.disturbances.enabled
                  ? 'bg-rose-500 text-slate-950'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {engine.disturbances.enabled ? 'DISTURBANCES ACTIVE' : 'ENABLE DISTURBANCES'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
            {/* Additive Noise */}
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
              <div className="flex justify-between text-slate-300">
                <span>Sensor Noise</span>
                <span className="text-cyan-400 font-bold">{engine.disturbances.noisePercent}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="80"
                value={engine.disturbances.noisePercent}
                onChange={(e) => {
                  engine.disturbances.noisePercent = Number(e.target.value);
                  setTick((t) => t + 1);
                }}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            {/* Optical Defocus Blur */}
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
              <div className="flex justify-between text-slate-300">
                <span>Defocus Blur</span>
                <span className="text-purple-400 font-bold">{engine.disturbances.blurPx.toFixed(1)} px</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={engine.disturbances.blurPx}
                onChange={(e) => {
                  engine.disturbances.blurPx = Number(e.target.value);
                  setTick((t) => t + 1);
                }}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>

            {/* Synthetic Platform Vibration */}
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
              <div className="flex justify-between text-slate-300">
                <span>Synthetic Vibration</span>
                <span className="text-amber-400 font-bold">±{engine.disturbances.syntheticVibrationPx} px</span>
              </div>
              <input
                type="range"
                min="0"
                max="15"
                value={engine.disturbances.syntheticVibrationPx}
                onChange={(e) => {
                  engine.disturbances.syntheticVibrationPx = Number(e.target.value);
                  setTick((t) => t + 1);
                }}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Contrast / Attenuation */}
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
              <div className="flex justify-between text-slate-300">
                <span>Atmospheric Haze / Contrast</span>
                <span className="text-emerald-400 font-bold">{engine.disturbances.contrastPercent}%</span>
              </div>
              <input
                type="range"
                min="-60"
                max="40"
                value={engine.disturbances.contrastPercent}
                onChange={(e) => {
                  engine.disturbances.contrastPercent = Number(e.target.value);
                  setTick((t) => t + 1);
                }}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Camera Calibration Panel */}
      {showCalibrationPanel && (
        <div className="p-4 bg-slate-950/95 border-b border-slate-800 text-xs font-mono space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-cyan-400 uppercase tracking-wide">
              CAMERA INTRINSICS & PINHOLE CALIBRATION
            </span>
            <button
              onClick={() => {
                engine.config.fovXDeg = 72.0;
                engine.config.fovYDeg = 44.0;
                engine.config.k1Distortion = 0;
                engine.config.principalPoint = {
                  cx: engine.config.actualWidth / 2,
                  cy: engine.config.actualHeight / 2,
                };
                setTick((t) => t + 1);
              }}
              className="text-[10px] text-slate-400 hover:text-cyan-300 underline cursor-pointer"
            >
              Reset to 72° Standard WebCam
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
              <div className="flex justify-between text-slate-300">
                <span>Horizontal FOV (H-FOV)</span>
                <span className="text-cyan-400 font-bold">{engine.config.fovXDeg.toFixed(1)}°</span>
              </div>
              <input
                type="range"
                min="35"
                max="110"
                step="0.5"
                value={engine.config.fovXDeg}
                onChange={(e) => {
                  engine.config.fovXDeg = Number(e.target.value);
                  setTick((t) => t + 1);
                }}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
              <div className="flex justify-between text-slate-300">
                <span>Vertical FOV (V-FOV)</span>
                <span className="text-cyan-400 font-bold">{engine.config.fovYDeg.toFixed(1)}°</span>
              </div>
              <input
                type="range"
                min="20"
                max="85"
                step="0.5"
                value={engine.config.fovYDeg}
                onChange={(e) => {
                  engine.config.fovYDeg = Number(e.target.value);
                  setTick((t) => t + 1);
                }}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
              <div className="flex justify-between text-slate-300">
                <span>Radial Distortion (k1)</span>
                <span className="text-purple-400 font-bold">{engine.config.k1Distortion.toFixed(3)}</span>
              </div>
              <input
                type="range"
                min="-0.2"
                max="0.2"
                step="0.005"
                value={engine.config.k1Distortion}
                onChange={(e) => {
                  engine.config.k1Distortion = Number(e.target.value);
                  setTick((t) => t + 1);
                }}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>

            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-slate-300 font-semibold">Evaluation Reference</div>
                <div className="text-[9px] text-slate-500">Measures physical ground-truth error</div>
              </div>
              <button
                onClick={() => {
                  engine.evalReference.enabled = !engine.evalReference.enabled;
                  setTick((t) => t + 1);
                }}
                className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer ${
                  engine.evalReference.enabled
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {engine.evalReference.enabled ? 'ACTIVE' : 'OFF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Position Estimation & Noise Filtering Panel */}
      {showFilterPanel && (
        <div className="p-4 bg-slate-950/95 border-b border-slate-800 text-xs font-mono space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-cyan-400 uppercase tracking-wide">
                POSITION ESTIMATION & NOISE FILTERING
              </span>
              <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                EWMA + Discrete Kalman Filter
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-400">
                Jitter Suppressed:{' '}
                <span className="text-emerald-400 font-bold">
                  {engine.filterResidualPx > 0 ? `-${engine.filterResidualPx.toFixed(1)} px` : '0.0 px'}
                </span>
              </span>
              <button
                onClick={() => {
                  engine.positionFilterMode = 'hybrid';
                  engine.ewmaTimeConstantSec = 0.035;
                  engine.adaptiveEwma = true;
                  engine.enableBufferingProtection = true;
                  setTick((t) => t + 1);
                }}
                className="text-[10px] text-slate-400 hover:text-cyan-300 underline cursor-pointer"
              >
                Reset to Optimal Hybrid
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
            {/* Filter Mode Selection */}
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
              <div className="text-slate-300 font-semibold mb-1.5 flex justify-between">
                <span>Filter Architecture</span>
                <span className="text-cyan-400 font-bold uppercase">{engine.positionFilterMode}</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                {(
                  [
                    { id: 'hybrid', label: 'Hybrid (EWMA+Kalman)' },
                    { id: 'kalman', label: 'Kalman Optimal' },
                    { id: 'ewma', label: 'EWMA Smoothing' },
                    { id: 'raw', label: 'Raw Centroid' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      engine.positionFilterMode = m.id;
                      setTick((t) => t + 1);
                    }}
                    className={`py-1 px-1.5 rounded text-center transition-colors cursor-pointer ${
                      engine.positionFilterMode === m.id
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* EWMA Filter Time Constant */}
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
              <div className="flex justify-between text-slate-300">
                <span>EWMA Cut-off Time Constant (τ)</span>
                <span className="text-cyan-400 font-bold">
                  {(engine.ewmaTimeConstantSec * 1000).toFixed(0)} ms
                </span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.12"
                step="0.005"
                value={engine.ewmaTimeConstantSec}
                onChange={(e) => {
                  engine.ewmaTimeConstantSec = Number(e.target.value);
                  setTick((t) => t + 1);
                }}
                className="w-full accent-cyan-500 cursor-pointer mt-1"
              />
              <div className="text-[9px] text-slate-500 mt-1 flex justify-between">
                <span>10ms (Responsive)</span>
                <span>120ms (Heavy Damped)</span>
              </div>
            </div>

            {/* Adaptive Maneuver Slew */}
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-slate-300 font-semibold">Adaptive Slew Boost</div>
                <div className="text-[9px] text-slate-500">Raises α on fast motion to eliminate lag</div>
              </div>
              <button
                onClick={() => {
                  engine.adaptiveEwma = !engine.adaptiveEwma;
                  setTick((t) => t + 1);
                }}
                className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer ${
                  engine.adaptiveEwma
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {engine.adaptiveEwma ? 'ENABLED' : 'DISABLED'}
              </button>
            </div>

            {/* Buffering & Stutter Protection */}
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-slate-300 font-semibold">Buffering Guard</div>
                <div className="text-[9px] text-slate-500">Skips duplicate frame readbacks</div>
              </div>
              <button
                onClick={() => {
                  engine.enableBufferingProtection = !engine.enableBufferingProtection;
                  setTick((t) => t + 1);
                }}
                className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer ${
                  engine.enableBufferingProtection
                    ? 'bg-purple-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {engine.enableBufferingProtection ? 'ACTIVE' : 'OFF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible PID Gimbal Servoing Tuning Panel */}
      {showPidPanel && (
        <div className="p-4 bg-slate-950/95 border-b border-slate-800 text-xs font-mono space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-emerald-400 uppercase tracking-wide">
                CLOSED-LOOP GIMBAL PID CONTROLLER TUNING
              </span>
              <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                Visual Servoing Loop
              </span>
            </div>
            <button
              onClick={() => {
                engine.pidGains.kp = 2.8;
                engine.pidGains.ki = 0.35;
                engine.pidGains.kd = 0.45;
                engine.pidGains.feedforward = true;
                engine.pidGains.kff = 0.75;
                engine.pidGains.integralClamp = 15.0;
                engine.pidGains.deadbandPx = 1.5;
                setTick((t) => t + 1);
              }}
              className="text-[10px] text-slate-400 hover:text-emerald-300 underline cursor-pointer"
            >
              Reset to Optimal PAT Gains
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
            {/* Kp */}
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
              <div className="flex justify-between text-slate-300">
                <span>Proportional Gain (Kp)</span>
                <span className="text-emerald-400 font-bold">{engine.pidGains.kp.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="8.0"
                step="0.1"
                value={engine.pidGains.kp}
                onChange={(e) => {
                  engine.pidGains.kp = Number(e.target.value);
                  setTick((t) => t + 1);
                }}
                className="w-full accent-emerald-500 cursor-pointer mt-1"
              />
              <div className="text-[9px] text-slate-500 mt-1 flex justify-between">
                <span>Gentle</span>
                <span>Aggressive</span>
              </div>
            </div>

            {/* Ki */}
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
              <div className="flex justify-between text-slate-300">
                <span>Integral Gain (Ki)</span>
                <span className="text-cyan-400 font-bold">{engine.pidGains.ki.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.5"
                step="0.05"
                value={engine.pidGains.ki}
                onChange={(e) => {
                  engine.pidGains.ki = Number(e.target.value);
                  setTick((t) => t + 1);
                }}
                className="w-full accent-cyan-500 cursor-pointer mt-1"
              />
              <div className="text-[9px] text-slate-500 mt-1 flex justify-between">
                <span>Eliminates pointing offset</span>
                <span>Clamp: ±{engine.pidGains.integralClamp}°</span>
              </div>
            </div>

            {/* Kd */}
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
              <div className="flex justify-between text-slate-300">
                <span>Derivative Damping (Kd)</span>
                <span className="text-purple-400 font-bold">{engine.pidGains.kd.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.5"
                step="0.05"
                value={engine.pidGains.kd}
                onChange={(e) => {
                  engine.pidGains.kd = Number(e.target.value);
                  setTick((t) => t + 1);
                }}
                className="w-full accent-purple-500 cursor-pointer mt-1"
              />
              <div className="text-[9px] text-slate-500 mt-1 flex justify-between">
                <span>Prevents overshoot & jitter</span>
              </div>
            </div>

            {/* Feedforward & Deadband */}
            <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-slate-300 font-semibold">Velocity Feedforward</div>
                  <div className="text-[9px] text-slate-500">Dynamic target anticipation</div>
                </div>
                <button
                  onClick={() => {
                    engine.pidGains.feedforward = !engine.pidGains.feedforward;
                    setTick((t) => t + 1);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                    engine.pidGains.feedforward
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {engine.pidGains.feedforward ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="flex justify-between text-slate-400 text-[10px] mt-2">
                <span>Gain (Kff): {engine.pidGains.kff.toFixed(2)}</span>
                <span>Deadband: {engine.pidGains.deadbandPx}px</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Canvas Area */}
      <div className="relative aspect-video w-full bg-black overflow-hidden flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="w-full h-full object-contain block"
        />

        {/* Top HUD Badges Overlay */}
        <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none text-xs font-mono">
          {/* Left Status Group */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold ${getStatusBadge(engine.fsmState)}`}>
              <span className="w-2 h-2 rounded-full bg-current animate-ping" />
              <span>{engine.fsmState}</span>
            </div>

            <div className="bg-slate-950/80 border border-slate-800/80 px-2.5 py-1 rounded-lg text-slate-300 flex items-center gap-1.5">
              <span className="text-slate-500">CONF:</span>
              <span className="text-cyan-400 font-bold">{(engine.currentDetection.confidence * 100).toFixed(0)}%</span>
            </div>

            {engine.fsmState === 'LOCKED' && (
              <div className="bg-emerald-950/80 border border-emerald-500/50 px-2.5 py-1 rounded-lg text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>&lt; 1.80° PAT LOCKED</span>
              </div>
            )}

            {engine.positionFilterMode !== 'raw' && (
              <div className="bg-slate-950/80 border border-cyan-500/40 px-2.5 py-1 rounded-lg text-cyan-300 flex items-center gap-1.5 text-[10px]">
                <span className="text-slate-400">FILTER:</span>
                <span className="text-cyan-400 font-bold uppercase">{engine.positionFilterMode}</span>
                {engine.filterResidualPx > 0 && (
                  <span className="text-emerald-400 font-bold">(-{engine.filterResidualPx.toFixed(1)}px)</span>
                )}
              </div>
            )}
          </div>

          {/* Center Mode Switcher Pills */}
          <div className="pointer-events-auto flex items-center bg-slate-950/90 p-0.5 rounded-lg border border-slate-800 shadow-md">
            {(
              [
                { id: 'explainability', label: 'EXPLAIN HUD' },
                { id: 'normal', label: 'CLEAN' },
                { id: 'gate', label: 'GATE ROI' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                onClick={() => setSensorViewMode(mode.id)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                  sensorViewMode === mode.id
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Right Metrics Readout */}
          <div className="flex items-center gap-2">
            <div className="bg-slate-950/80 border border-slate-800/80 px-2.5 py-1 rounded-lg text-slate-300 flex items-center gap-2">
              <span className="text-slate-500">FPS:</span>
              <span className="text-emerald-400 font-bold">{tele?.fps || engine.metrics.currentFps}</span>
            </div>
            <div className="bg-slate-950/80 border border-slate-800/80 px-2.5 py-1 rounded-lg text-slate-300 flex items-center gap-2">
              <span className="text-slate-500">LATENCY:</span>
              <span className="text-amber-400 font-bold">{tele?.latencyMs || engine.metrics.averageLatencyMs} ms</span>
            </div>
          </div>
        </div>

        {/* Bottom Error & Virtual Gimbal Readout Overlay */}
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none text-xs font-mono">
          <div className="bg-slate-950/85 backdrop-blur border border-slate-800 px-3 py-1.5 rounded-lg text-slate-200 flex items-center gap-3">
            <div>
              <span className="text-slate-500 text-[10px]">POINTING ERROR: </span>
              <span className="text-cyan-400 font-bold">
                {tele ? `${tele.angularErrorDeg.toFixed(2)}° (${tele.angularErrorMrad.toFixed(1)} mrad)` : '0.00°'}
              </span>
            </div>
            <div className="hidden sm:inline border-l border-slate-800 pl-3">
              <span className="text-slate-500 text-[10px]">PIXEL OFFSET: </span>
              <span className="text-amber-400 font-bold">{tele ? `${tele.pixelError} px` : '0 px'}</span>
            </div>
          </div>

          <div className="bg-slate-950/85 backdrop-blur border border-slate-800 px-3 py-1.5 rounded-lg text-slate-200 flex items-center gap-3">
            <div>
              <span className="text-slate-500 text-[10px]">VIRTUAL GIMBAL: </span>
              <span className="text-emerald-400 font-bold">
                P: {engine.virtualGimbal.panDeg.toFixed(1)}° / T: {engine.virtualGimbal.tiltDeg.toFixed(1)}°
              </span>
            </div>
            <div className="hidden md:inline border-l border-slate-800 pl-3 text-slate-400 text-[10px]">
              RATE: {engine.virtualGimbal.panVelDegPerSec.toFixed(1)}°/s
            </div>
          </div>
        </div>
      </div>

      {/* Performance Summary Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 p-3 bg-slate-950 border-t border-slate-800 font-mono text-xs">
        <div className="bg-slate-900/60 p-2 rounded border border-slate-800/80">
          <div className="text-[10px] text-slate-400">FRAMES PROCESSED</div>
          <div className="text-base font-bold text-slate-200">{engine.metrics.framesProcessed}</div>
          <div className="text-[9px] text-slate-500">Real camera feed</div>
        </div>

        <div className="bg-slate-900/60 p-2 rounded border border-slate-800/80">
          <div className="text-[10px] text-slate-400">DETECTION RATE</div>
          <div className="text-base font-bold text-cyan-400">{engine.metrics.detectionRate}%</div>
          <div className="text-[9px] text-slate-500">Avg Conf: {engine.metrics.averageConfidence}</div>
        </div>

        <div className="bg-slate-900/60 p-2 rounded border border-slate-800/80">
          <div className="text-[10px] text-slate-400">LOCK RETENTION</div>
          <div className="text-base font-bold text-emerald-400">{engine.metrics.lockRetentionRate}%</div>
          <div className="text-[9px] text-slate-500">{engine.metrics.lockDurationSec.toFixed(1)}s total lock</div>
        </div>

        <div className="bg-slate-900/60 p-2 rounded border border-slate-800/80">
          <div className="text-[10px] text-slate-400">LOCK LOSSES</div>
          <div className="text-base font-bold text-amber-400">{engine.metrics.lockLossCount}</div>
          <div className="text-[9px] text-slate-500">
            {engine.metrics.reacquisitionTimeSec !== null ? `Reacq: ${engine.metrics.reacquisitionTimeSec}s` : 'Zero Reacq'}
          </div>
        </div>

        <div className="bg-slate-900/60 p-2 rounded border border-slate-800/80">
          <div className="text-[10px] text-slate-400">TIME TO 1ST LOCK</div>
          <div className="text-base font-bold text-purple-400">
            {engine.metrics.timeToFirstLockSec !== null ? `${engine.metrics.timeToFirstLockSec}s` : 'SEARCHING'}
          </div>
          <div className="text-[9px] text-slate-500">
            {engine.metrics.timeToFirstDetectionSec !== null ? `Det: ${engine.metrics.timeToFirstDetectionSec}s` : 'Waiting'}
          </div>
        </div>

        <div className="bg-slate-900/60 p-2 rounded border border-slate-800/80">
          <div className="text-[10px] text-slate-400">P95 LATENCY</div>
          <div className="text-base font-bold text-sky-400">{engine.metrics.p95LatencyMs} ms</div>
          <div className="text-[9px] text-slate-500">Avg: {engine.metrics.averageLatencyMs} ms</div>
        </div>

        <div className="bg-slate-900/60 p-2 rounded border border-slate-800/80 flex flex-col justify-between">
          <div className="text-[10px] text-slate-400">DATA EXPORT</div>
          <div className="flex items-center gap-1.5 mt-1">
            <button
              onClick={() => engine.exportCSV()}
              className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] font-bold transition-colors cursor-pointer"
              title="Download Live Telemetry as CSV"
            >
              CSV
            </button>
            <button
              onClick={() => engine.exportJSON()}
              className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] font-bold transition-colors cursor-pointer"
              title="Download Telemetry & Calibration as JSON"
            >
              JSON
            </button>
          </div>
        </div>
      </div>

      {/* 8. Tracking Explainability Panel (Transparent Diagnostics & Decision Engine) */}
      <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800">
        <TrackingExplainabilityPanel
          data={engine.getExplainabilityData()}
          currentTelemetry={engine.currentTelemetry}
          events={engine.events || []}
          cameraConfig={engine.config}
          fsmState={engine.fsmState}
          onOpenHowItTracks={() => setShowHowItTracksModal(true)}
          onOpenGeometry={() => setShowGeometryModal(true)}
          onOpenReplay={() => setShowReplayModal(true)}
        />
      </div>

      {/* Modal 1: 9-Stage Tracking Process Transparency Guide */}
      {showHowItTracksModal && (
        <TrackingStepsModal
          isOpen={showHowItTracksModal}
          onClose={() => setShowHowItTracksModal(false)}
          data={engine.getExplainabilityData()}
          fsmState={engine.fsmState}
        />
      )}

      {/* Modal 2: 3D Camera Geometry & Ray Tracing Inspector */}
      {showGeometryModal && (
        <CameraGeometryModal
          isOpen={showGeometryModal}
          onClose={() => setShowGeometryModal(false)}
          cameraConfig={engine.config}
          data={engine.getExplainabilityData()}
        />
      )}

      {/* Modal 3: Frame-by-Frame Tracking Scrubber & Replay Inspector */}
      {showReplayModal && (
        <TrackingReplayModal
          isOpen={showReplayModal}
          onClose={() => setShowReplayModal(false)}
          replayBuffer={engine.replayBuffer}
        />
      )}
    </div>
  );
};
