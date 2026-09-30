import React, { useRef, useEffect, useState } from 'react';
import { FSOCSimulationEngine } from '../simulation/simulationEngine';
import { TrackingStatus } from '../types';
import { Crosshair, Eye, ShieldAlert, Zap, Layers } from 'lucide-react';

interface SyntheticCameraFeedProps {
  engine: FSOCSimulationEngine;
}

export const SyntheticCameraFeed: React.FC<SyntheticCameraFeedProps> = React.memo(({ engine }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showOverlays, setShowOverlays] = useState(true);
  const [showKalmanVector, setShowKalmanVector] = useState(true);
  const [colorTheme, setColorTheme] = useState<'emerald' | 'flir' | 'mono'>('emerald');
  const [, setTick] = useState(0);

  // Subscribe to engine changes for instantaneous UI button reactivity
  useEffect(() => {
    const unsubscribe = engine.subscribe(() => {
      setTick((t) => t + 1);
    });
    return unsubscribe;
  }, [engine]);

  // High-rate state ticker (10 Hz) to refresh header telemetry & HUD data
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      // Color themes for the optical sensor
      const themeColors = {
        emerald: {
          bg: '#04100c',
          grid: 'rgba(16, 185, 129, 0.08)',
          hud: '#10b981',
          hudDim: 'rgba(16, 185, 129, 0.4)',
          beaconGlow: 'rgba(52, 211, 153, 0.8)',
          beaconCore: '#ffffff',
          targetBox: '#10b981',
          errorLine: '#f59e0b',
        },
        flir: {
          bg: '#09090b',
          grid: 'rgba(234, 88, 12, 0.08)',
          hud: '#f97316',
          hudDim: 'rgba(249, 115, 22, 0.4)',
          beaconGlow: 'rgba(251, 146, 60, 0.9)',
          beaconCore: '#ffffff',
          targetBox: '#f97316',
          errorLine: '#ec4899',
        },
        mono: {
          bg: '#080c14',
          grid: 'rgba(56, 189, 248, 0.08)',
          hud: '#38bdf8',
          hudDim: 'rgba(56, 189, 248, 0.4)',
          beaconGlow: 'rgba(96, 165, 250, 0.85)',
          beaconCore: '#ffffff',
          targetBox: '#38bdf8',
          errorLine: '#fbbf24',
        },
      }[colorTheme];

      // 1. Clear Sensor Background
      ctx.fillStyle = themeColors.bg;
      ctx.fillRect(0, 0, w, h);

      // 2. Synthetic Sensor Noise Texture (Optimized grain rendering)
      const noisePercent = engine.disturbanceConfig.sensorNoisePercent;
      if (noisePercent > 0) {
        const noiseDots = Math.min(100, Math.floor((w * h * noisePercent) / 18000));
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.22, noisePercent * 0.005 + 0.04)})`;
        for (let i = 0; i < noiseDots; i++) {
          const nx = Math.random() * w;
          const ny = Math.random() * h;
          ctx.fillRect(nx, ny, 1.5, 1.5);
        }
      }

      // 3. Grid Scan Lines & Framing
      if (showOverlays) {
        ctx.strokeStyle = themeColors.grid;
        ctx.lineWidth = 1;
        const step = 64;
        for (let x = 0; x <= w; x += step) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y <= h; y += step) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      }

      // 4. Optical Center Reticle & Link Acceptance Cone
      // Acceptance cone: fine link threshold = 0.22 deg -> in pixels:
      const fx = (w / 2) / Math.tan((engine.cameraConfig.fovXDeg * Math.PI) / 360);
      const linkTolerancePx = fx * Math.tan((0.22 * Math.PI) / 180);

      // Fine pointing lock ring
      ctx.strokeStyle = engine.currentTelemetry.isLocked ? themeColors.hud : themeColors.hudDim;
      ctx.lineWidth = engine.currentTelemetry.isLocked ? 2 : 1;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(12, linkTolerancePx), 0, Math.PI * 2);
      ctx.stroke();

      // Outer coarse acquisition ring
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 140, 0, Math.PI * 2);
      ctx.stroke();

      // Optical Center Crosshairs
      ctx.strokeStyle = themeColors.hud;
      ctx.lineWidth = 1.2;
      const crossSize = 18;
      const crossGap = 5;

      // Left line
      ctx.beginPath();
      ctx.moveTo(cx - crossSize - crossGap, cy);
      ctx.lineTo(cx - crossGap, cy);
      ctx.stroke();

      // Right line
      ctx.beginPath();
      ctx.moveTo(cx + crossGap, cy);
      ctx.lineTo(cx + crossSize + crossGap, cy);
      ctx.stroke();

      // Top line
      ctx.beginPath();
      ctx.moveTo(cx, cy - crossSize - crossGap);
      ctx.lineTo(cx, cy - crossGap);
      ctx.stroke();

      // Bottom line
      ctx.beginPath();
      ctx.moveTo(cx, cy + crossGap);
      ctx.lineTo(cx, cy + crossSize + crossGap);
      ctx.stroke();

      // Center precision point
      ctx.fillStyle = themeColors.hud;
      ctx.beginPath();
      ctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // 5. Render Decoys / Glints if active
      if (engine.targetConfig.multiTargetClutter) {
        engine.targetState.decoys.forEach((decoy) => {
          const decoyProj = engine.projectWorldToScreen(decoy.panDeg, decoy.tiltDeg);
          if (decoyProj.inFov) {
            ctx.fillStyle = `rgba(244, 63, 94, ${decoy.intensity * 0.4})`;
            ctx.beginPath();
            ctx.arc(decoyProj.x, decoyProj.y, 14, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.beginPath();
            ctx.arc(decoyProj.x, decoyProj.y, 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Decoy tag
            ctx.fillStyle = 'rgba(244, 63, 94, 0.8)';
            ctx.font = '9px JetBrains Mono, monospace';
            ctx.fillText(`CLUTTER ${decoy.id}`, decoyProj.x + 8, decoyProj.y - 6);
          }
        });
      }

      // 6. Render All Active Beacons in Frame (1 to 5)
      const activeCount = Math.max(1, Math.min(5, engine.targetConfig.beaconCount || 1));
      const activeBeacons = (engine.targetState.allBeacons || []).slice(0, activeCount);
      const selectedBeaconIdx = Math.max(0, Math.min(activeBeacons.length - 1, engine.targetConfig.selectedBeaconIndex || 0));
      const isOccluded = engine.targetState.isOccluded;
      const blur = engine.disturbanceConfig.opticalBlurPx;

      activeBeacons.forEach((beacon, idx) => {
        const bScreen = engine.projectWorldToScreen(beacon.panDeg, beacon.tiltDeg);
        if (!bScreen.inFov || isOccluded) return;

        const isTracked = idx === selectedBeaconIdx;
        const intensity = beacon.intensity;

        // Outer diffraction halo
        const grad = ctx.createRadialGradient(
          bScreen.x,
          bScreen.y,
          1,
          bScreen.x,
          bScreen.y,
          (isTracked ? 26 : 18) + blur * 4
        );
        grad.addColorStop(0, themeColors.beaconCore);
        grad.addColorStop(0.15, isTracked ? themeColors.beaconGlow : beacon.color);
        grad.addColorStop(0.5, isTracked ? `rgba(16, 185, 129, ${0.35 * intensity})` : `${beacon.color}44`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(bScreen.x, bScreen.y, (isTracked ? 30 : 20) + blur * 4, 0, Math.PI * 2);
        ctx.fill();

        // Laser central spot
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(bScreen.x, bScreen.y, Math.max(2, (isTracked ? 4 : 3) + blur * 0.4), 0, Math.PI * 2);
        ctx.fill();

        // Laser link beam bloom spikes
        ctx.strokeStyle = isTracked ? `rgba(255, 255, 255, ${0.45 * intensity})` : `rgba(255, 255, 255, ${0.25 * intensity})`;
        ctx.lineWidth = isTracked ? 1.2 : 0.8;
        const spikeLen = (isTracked ? 15 : 10) + blur * 2.5;
        ctx.beginPath();
        ctx.moveTo(bScreen.x - spikeLen, bScreen.y);
        ctx.lineTo(bScreen.x + spikeLen, bScreen.y);
        ctx.moveTo(bScreen.x, bScreen.y - spikeLen);
        ctx.lineTo(bScreen.x + spikeLen, bScreen.y);
        ctx.stroke();

        // Secondary beacon label for non-tracked beacons
        if (!isTracked && showOverlays) {
          ctx.fillStyle = beacon.color;
          ctx.font = '9px JetBrains Mono, monospace';
          ctx.fillText(`${beacon.callsign} (${beacon.wavelengthNm}nm)`, bScreen.x + 12, bScreen.y - 4);
        }
      });





      // 7. Render Detection Bounding Box & Centroid Marker with Intelligent Collision Avoidance
      const detection = engine.currentDetection;
      if (detection.detected && detection.boundingBox && detection.centroid) {
        const box = detection.boundingBox;
        const mode = detection.modeUsed;

        const isLockStatus = engine.currentTelemetry.status === 'LOCKED';
        const modeColor =
          isLockStatus
            ? '#10b981'
            : mode === 'ai_neural'
            ? '#38bdf8'
            : mode === 'kalman_predictive'
            ? '#34d399'
            : '#eab308';

        ctx.strokeStyle = modeColor;
        ctx.lineWidth = isLockStatus ? 2 : 1.5;

        // Draw tactical corner brackets around detected beacon
        const cornerLen = 8;
        // Top-left
        ctx.beginPath();
        ctx.moveTo(box.x, box.y + cornerLen);
        ctx.lineTo(box.x, box.y);
        ctx.lineTo(box.x + cornerLen, box.y);
        ctx.stroke();
        // Top-right
        ctx.beginPath();
        ctx.moveTo(box.x + box.width - cornerLen, box.y);
        ctx.lineTo(box.x + box.width, box.y);
        ctx.lineTo(box.x + box.width, box.y + cornerLen);
        ctx.stroke();
        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(box.x, box.y + box.height - cornerLen);
        ctx.lineTo(box.x, box.y + box.height);
        ctx.lineTo(box.x + cornerLen, box.y + box.height);
        ctx.stroke();
        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(box.x + box.width - cornerLen, box.y + box.height);
        ctx.lineTo(box.x + box.width, box.y + box.height);
        ctx.lineTo(box.x + box.width, box.y + box.height - cornerLen);
        ctx.stroke();

        // Pulsing target halo when locked
        if (isLockStatus) {
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(detection.centroid.x, detection.centroid.y, Math.max(16, (box.width + box.height) / 3), 0, Math.PI * 2);
          ctx.stroke();
        }

        // Detected Centroid Point
        ctx.fillStyle = modeColor;
        ctx.beginPath();
        ctx.arc(detection.centroid.x, detection.centroid.y, 3, 0, Math.PI * 2);
        ctx.fill();

        // INTELLIGENT NON-OVERLAPPING BEACON LABEL
        // Calculates label placement so it never clips canvas boundaries and never obscures laser emitter
        const labelModeTag =
          mode === 'ai_neural'
            ? 'AI NEURAL'
            : mode === 'kalman_predictive'
            ? 'KALMAN PAT'
            : 'CV CENTROID';
        const activeTarget = activeBeacons[selectedBeaconIdx] || activeBeacons[0];
        const targetCallsign = activeTarget?.callsign || 'ALPHA';
        const labelText = `${activeTarget?.id || 'TGT-01'} [${targetCallsign}]: ${labelModeTag} ${(detection.confidence * 100).toFixed(0)}%`;
        
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

        // Draw protective dark background badge for 100% legibility
        ctx.fillStyle = 'rgba(5, 9, 20, 0.88)';
        ctx.strokeStyle = modeColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
        } else {
          ctx.rect(badgeX, badgeY, badgeW, badgeH);
        }
        ctx.fill();
        ctx.stroke();

        // Draw text inside badge
        ctx.fillStyle = modeColor;
        ctx.textAlign = 'left';
        ctx.fillText(labelText, badgeX + 8, badgeY + 13);

        // 8. Error Vector Line from Boresight Center to Detected Target
        const distToCenter = Math.hypot(detection.centroid.x - cx, detection.centroid.y - cy);
        if (showOverlays && distToCenter > 3) {
          ctx.strokeStyle = isLockStatus ? 'rgba(16, 185, 129, 0.7)' : themeColors.errorLine;
          ctx.lineWidth = isLockStatus ? 1.5 : 1.2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(detection.centroid.x, detection.centroid.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Error Distance Label with Perpendicular Offset to avoid overlapping target or center
          if (distToCenter > 50) {
            const midX = (cx + detection.centroid.x) / 2;
            const midY = (cy + detection.centroid.y) / 2;
            const normX = -(detection.centroid.y - cy) / distToCenter;
            const normY = (detection.centroid.x - cx) / distToCenter;

            const errText = `Δ ${engine.currentTelemetry.pixelError.toFixed(1)}px (${engine.currentTelemetry.angularErrorDeg.toFixed(2)}°)`;
            const errMetrics = ctx.measureText(errText);
            const errBadgeW = errMetrics.width + 10;
            const errBadgeH = 16;

            let errBadgeX = midX + normX * 16 - errBadgeW / 2;
            let errBadgeY = midY + normY * 16 - errBadgeH / 2;
            errBadgeX = Math.max(12, Math.min(w - errBadgeW - 12, errBadgeX));
            errBadgeY = Math.max(30, Math.min(h - errBadgeH - 30, errBadgeY));

            ctx.fillStyle = 'rgba(5, 9, 20, 0.85)';
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(errBadgeX, errBadgeY, errBadgeW, errBadgeH, 3);
            } else {
              ctx.rect(errBadgeX, errBadgeY, errBadgeW, errBadgeH);
            }
            ctx.fill();

            ctx.fillStyle = isLockStatus ? '#34d399' : themeColors.errorLine;
            ctx.font = '9px JetBrains Mono, monospace';
            ctx.fillText(errText, errBadgeX + 5, errBadgeY + 11);
          }
        }
      }

      // 9. Kalman Filter Velocity & Prediction Vector
      const kState = engine.kalmanFilter.getState();
      if (showKalmanVector && kState.isInitialized) {
        const predAhead = engine.kalmanFilter.predictAhead(0.06); // 60ms prediction
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(kState.x, kState.y);
        ctx.lineTo(predAhead.x, predAhead.y);
        ctx.stroke();

        // Prediction Marker
        ctx.fillStyle = '#a855f7';
        ctx.beginPath();
        ctx.arc(predAhead.x, predAhead.y, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#c084fc';
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.fillText('EST VEL T+60ms', Math.max(12, Math.min(w - 90, predAhead.x + 6)), Math.max(20, Math.min(h - 20, predAhead.y + 3)));
      }

      // 10. Coasting / Reacquisition / Lost Alert Banners with Tactical Backdrop
      if (engine.currentTelemetry.status === 'COASTING') {
        const msg = '⚠ BEACON LOSS — COASTING ON KALMAN VELOCITY LOOKAHEAD';
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        const mW = ctx.measureText(msg).width + 24;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cx - mW / 2, 54, mW, 24, 4);
        else ctx.rect(cx - mW / 2, 54, mW, 24);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fbbf24';
        ctx.textAlign = 'center';
        ctx.fillText(msg, cx, 70);
        ctx.textAlign = 'left';
      } else if (engine.currentTelemetry.status === 'REACQUIRING') {
        const msg = '⚡ BEACON RE-DETECTED — REACQUIRING OPTICAL LOCK...';
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        const mW = ctx.measureText(msg).width + 24;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cx - mW / 2, 54, mW, 24, 4);
        else ctx.rect(cx - mW / 2, 54, mW, 24);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'center';
        ctx.fillText(msg, cx, 70);
        ctx.textAlign = 'left';
      } else if (engine.currentTelemetry.status === 'LOST') {
        const msg = '✖ TARGET OUT OF FOV — AUTONOMOUS PAT SEARCH ACTIVE';
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        const mW = ctx.measureText(msg).width + 24;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cx - mW / 2, 54, mW, 24, 4);
        else ctx.rect(cx - mW / 2, 54, mW, 24);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f87171';
        ctx.textAlign = 'center';
        ctx.fillText(msg, cx, 70);
        ctx.textAlign = 'left';
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [engine, showOverlays, showKalmanVector, colorTheme]);

  const telemetry = engine.currentTelemetry;
  const isLocked = telemetry.isLocked;

  const getStatusBadgeStyle = (status: TrackingStatus) => {
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

  const getStatusDotColor = (status: TrackingStatus) => {
    switch (status) {
      case 'LOCKED':
        return 'bg-emerald-400';
      case 'TRACKING':
        return 'bg-cyan-400';
      case 'REACQUIRING':
        return 'bg-sky-400';
      case 'ACQUIRING':
        return 'bg-blue-400';
      case 'COASTING':
        return 'bg-purple-400';
      case 'SEARCHING':
        return 'bg-slate-400';
      case 'LOST':
        return 'bg-rose-500';
    }
  };

  const halfW = engine.cameraConfig.width / 2;
  const halfH = engine.cameraConfig.height / 2;
  const ex = telemetry.detectedScreen ? (telemetry.detectedScreen.x - halfW).toFixed(1) : '---';
  const ey = telemetry.detectedScreen ? (telemetry.detectedScreen.y - halfH).toFixed(1) : '---';

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const activeCount = Math.max(1, Math.min(5, engine.targetConfig.beaconCount || 1));
    const activeBeacons = (engine.targetState.allBeacons || []).slice(0, activeCount);

    let closestIdx = -1;
    let minDist = 50;

    activeBeacons.forEach((beacon, idx) => {
      const bScreen = engine.projectWorldToScreen(beacon.panDeg, beacon.tiltDeg);
      if (bScreen.inFov) {
        const dist = Math.hypot(bScreen.x - clickX, bScreen.y - clickY);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = idx;
        }
      }
    });

    if (closestIdx !== -1) {
      engine.setSelectedBeacon(closestIdx);
    }
  };

  const activeTargetBeacon = engine.targetState.allBeacons[engine.targetConfig.selectedBeaconIndex] || engine.targetState.allBeacons[0];

  return (
    <div id="synthetic-camera-container" className="relative flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Top Header & Instrument Meta Strip */}
      <div className="flex flex-col gap-2 px-4 py-3 bg-slate-950/90 border-b border-slate-800 backdrop-blur-md text-xs font-mono">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-slate-300">
            <div className="flex items-center gap-2 font-bold tracking-wider text-white">
              <Crosshair className="w-4 h-4 text-cyan-400" />
              <span>OPTICAL SENSOR FEED</span>
            </div>
            <span className="text-slate-600 hidden sm:inline">·</span>
            <span className="text-slate-400">
              FOV <strong className="text-slate-200">{engine.cameraConfig.fovXDeg}° × {engine.cameraConfig.fovYDeg}°</strong>
            </span>
            <span className="text-slate-600 hidden md:inline">·</span>
            <span className="text-slate-400 hidden md:inline">
              FPA <strong className="text-slate-200">{engine.cameraConfig.width}×{engine.cameraConfig.height} CMOS-IR</strong>
            </span>
            <span className="text-slate-600 hidden lg:inline">·</span>
            <span className="text-slate-400 hidden lg:inline">
              CARRIER <strong className="text-emerald-400 font-semibold">{engine.targetConfig.beaconWavelengthNm} nm</strong>
            </span>
          </div>

          {/* Lock State & Rate Badges */}
          <div className="flex items-center gap-3">
            <div
              id="lock-status-pill"
              className={`px-3 py-1 rounded-lg text-xs font-bold font-mono tracking-wider flex items-center gap-2 border transition-all ${getStatusBadgeStyle(
                telemetry.status
              )}`}
            >
              <span className={`w-2 h-2 rounded-full ${getStatusDotColor(telemetry.status)} animate-ping`} />
              <span>{telemetry.status}</span>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-300">
              <span className="text-slate-500 text-[10px]">RATE:</span>
              <span className="font-bold text-cyan-400">{telemetry.fps} FPS</span>
            </div>
          </div>
        </div>

        {/* Input Feature Strip: 1. Select Beacon Count (1-5) & 2. Select Tracked Beacon */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-[11px]">
          {/* Feature 1: Select Beacon Count (1-5) */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span>BEACONS IN FRAME:</span>
            </span>
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
              {[1, 2, 3, 4, 5].map((cnt) => (
                <button
                  key={cnt}
                  onClick={() => engine.setBeaconCount(cnt)}
                  title={`Display ${cnt} beacon${cnt > 1 ? 's' : ''} in simulation frame`}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    engine.targetConfig.beaconCount === cnt
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
          </div>

          {/* Feature 2: Select Tracked Beacon */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
              <span>TRACK TARGET:</span>
            </span>
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 gap-1">
              {engine.targetState.allBeacons.slice(0, engine.targetConfig.beaconCount).map((b, idx) => {
                const isSelected = engine.targetConfig.selectedBeaconIndex === idx;
                return (
                  <button
                    key={b.id}
                    onClick={() => engine.setSelectedBeacon(idx)}
                    title={`Lock PAT system tracking strictly onto ${b.name} (${b.wavelengthNm}nm)`}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: isSelected ? '#000000' : b.color }}
                    />
                    <span>{b.callsign}</span>
                    <span className={`text-[9px] ${isSelected ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>
                      {b.wavelengthNm}nm
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Canvas Viewport with Non-overlapping Floating Telemetry */}
      <div className="relative aspect-video w-full bg-black overflow-hidden">
        <canvas
          ref={canvasRef}
          width={engine.cameraConfig.width}
          height={engine.cameraConfig.height}
          onClick={handleCanvasClick}
          title="Click any beacon in the optical sensor feed to lock and track it"
          className="w-full h-full object-contain block cursor-crosshair"
        />

        {/* Top-Left HUD: Gimbal Boresight Kinematics */}
        <div className="absolute top-3 left-3 pointer-events-none font-mono text-[11px] bg-slate-950/85 backdrop-blur-md p-3 rounded-xl border border-slate-800/80 shadow-lg space-y-1">
          <div className="text-cyan-400 font-bold flex items-center gap-1.5 text-xs pb-1 border-b border-slate-800/60">
            <Zap className="w-3.5 h-3.5" />
            <span>GIMBAL BORESIGHT</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-300">
            <span className="text-slate-500">AZ / PAN:</span>
            <span className="text-emerald-400 font-bold">{telemetry.cameraPanDeg >= 0 ? '+' : ''}{telemetry.cameraPanDeg.toFixed(2)}°</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-300">
            <span className="text-slate-500">EL / TILT:</span>
            <span className="text-emerald-400 font-bold">{telemetry.cameraTiltDeg >= 0 ? '+' : ''}{telemetry.cameraTiltDeg.toFixed(2)}°</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-400 text-[10px]">
            <span className="text-slate-500">VIB JITTER:</span>
            <span className="text-amber-400 font-semibold">±{engine.cameraState.jitterPanDeg.toFixed(2)}°</span>
          </div>
        </div>

        {/* Top-Right HUD: Target & Perception Intelligence */}
        <div className="absolute top-3 right-3 pointer-events-none font-mono text-[11px] bg-slate-950/85 backdrop-blur-md p-3 rounded-xl border border-slate-800/80 shadow-lg space-y-1 text-right">
          <div className="text-purple-400 font-bold flex items-center justify-end gap-1.5 text-xs pb-1 border-b border-slate-800/60">
            <Eye className="w-3.5 h-3.5" />
            <span>TARGET TELEMETRY</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-300">
            <span className="text-slate-500">TARGET ID:</span>
            <span className="text-slate-100 font-bold">{activeTargetBeacon?.name || `Beacon ${engine.targetConfig.selectedBeaconIndex + 1}`} ({engine.targetConfig.beaconWavelengthNm}nm)</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-300">
            <span className="text-slate-500">DETECTOR:</span>
            <span className="text-cyan-400 font-bold uppercase">{engine.perceptionMode.replace('_', ' ')}</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-300">
            <span className="text-slate-500">CONFIDENCE:</span>
            <span className="text-emerald-400 font-bold">{(engine.currentDetection.confidence * 100).toFixed(0)}%</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-400 text-[10px]">
            <span className="text-slate-500">CARRIER SNR:</span>
            <span className="text-amber-400 font-bold">{engine.currentDetection.snrDb.toFixed(1)} dB</span>
          </div>
        </div>

        {/* Bottom-Left HUD: Pointing Alignment Error vs Link Acceptance Limit */}
        <div className="absolute bottom-3 left-3 pointer-events-none font-mono text-[11px] bg-slate-950/85 backdrop-blur-md p-3 rounded-xl border border-slate-800/80 shadow-lg space-y-1">
          <div className="text-amber-400 font-bold flex items-center justify-between text-xs pb-1 border-b border-slate-800/60">
            <span>POINTING ALIGNMENT DIVERGENCE</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${telemetry.angularErrorDeg < 0.22 ? 'text-emerald-400 bg-emerald-950/60' : 'text-rose-400 bg-rose-950/60'}`}>
              {telemetry.angularErrorDeg < 0.22 ? 'LINK IN CONE' : 'SEEKING'}
            </span>
          </div>
          <div className="flex justify-between gap-4 text-slate-200">
            <span className="text-slate-400">INSTANTANEOUS OPTICAL:</span>
            <span className={`font-bold ${telemetry.angularErrorDeg < 0.22 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {telemetry.angularErrorDeg.toFixed(3)}° ({telemetry.angularErrorMrad.toFixed(2)} mrad)
            </span>
          </div>
          {telemetry.mechanicalPointingErrorDeg !== undefined && (
            <div className="flex justify-between gap-4 text-slate-300 text-[10px]">
              <span className="text-slate-500">MECHANICAL BORESIGHT:</span>
              <span className={`font-semibold ${telemetry.mechanicalPointingErrorDeg < 0.22 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {telemetry.mechanicalPointingErrorDeg.toFixed(3)}° ({(telemetry.mechanicalPointingErrorDeg * 17.4533).toFixed(2)} mrad)
              </span>
            </div>
          )}
          <div className="flex justify-between gap-4 text-slate-400 text-[10px]">
            <span className="text-slate-500">FOCAL PLANE OFFSET:</span>
            <span className="text-cyan-400 font-medium">ΔX: {ex}px, ΔY: {ey}px ({telemetry.pixelError.toFixed(1)}px total)</span>
          </div>
          <div className="text-slate-500 text-[10px] pt-0.5 border-t border-slate-800/40">
            Fine Link Acceptance Cone: <span className="text-emerald-400 font-semibold">&lt; 0.22° (~3.84 mrad)</span>
          </div>
        </div>

        {/* Bottom-Right HUD: Viewport Overlays & Filter Palette */}
        <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-slate-950/90 p-2 rounded-xl border border-slate-800 backdrop-blur-md shadow-lg text-xs">
          <button
            id="toggle-overlays-btn"
            onClick={() => setShowOverlays(!showOverlays)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
              showOverlays ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm' : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Grid Overlay
          </button>
          <button
            id="toggle-kalman-btn"
            onClick={() => setShowKalmanVector(!showKalmanVector)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
              showKalmanVector ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50 shadow-sm' : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Kalman Vector
          </button>
          <div className="h-5 w-px bg-slate-800 mx-1" />
          <div className="flex rounded-lg bg-slate-900 border border-slate-800 p-1">
            {(['emerald', 'flir', 'mono'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setColorTheme(t)}
                className={`px-2.5 py-1 text-[10px] uppercase font-mono font-semibold rounded transition-colors cursor-pointer ${
                  colorTheme === t ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});
