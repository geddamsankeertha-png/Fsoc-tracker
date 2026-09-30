import React, { useRef, useEffect, useState } from 'react';
import { FSOCSimulationEngine } from '../simulation/simulationEngine';
import { Radio, Navigation, Maximize2 } from 'lucide-react';

interface SpatialTacticalViewProps {
  engine: FSOCSimulationEngine;
}

type AspectRatioMode = 'auto' | '16/9' | '16/10' | '4/3' | '1/1';

export const SpatialTacticalView: React.FC<SpatialTacticalViewProps> = React.memo(({ engine }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [aspectRatioMode, setAspectRatioMode] = useState<AspectRatioMode>('auto');
  const [frameDimensions, setFrameDimensions] = useState<{ width: number; height: number; ratio: string }>({
    width: 640,
    height: 400,
    ratio: '1.60',
  });

  // Dynamically calculate and modify the frame ratio according to the available space
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let rafId: number | null = null;

    const updateCanvasDimensions = () => {
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      let targetW = rect.width;
      let targetH = rect.height;

      if (aspectRatioMode === '16/9') {
        const hByW = targetW * (9 / 16);
        if (hByW <= rect.height) {
          targetH = hByW;
        } else {
          targetH = rect.height;
          targetW = targetH * (16 / 9);
        }
      } else if (aspectRatioMode === '16/10') {
        const hByW = targetW * (10 / 16);
        if (hByW <= rect.height) {
          targetH = hByW;
        } else {
          targetH = rect.height;
          targetW = targetH * (16 / 10);
        }
      } else if (aspectRatioMode === '4/3') {
        const hByW = targetW * (3 / 4);
        if (hByW <= rect.height) {
          targetH = hByW;
        } else {
          targetH = rect.height;
          targetW = targetH * (4 / 3);
        }
      } else if (aspectRatioMode === '1/1') {
        const side = Math.min(rect.width, rect.height);
        targetW = side;
        targetH = side;
      }
      // When 'auto', targetW = rect.width and targetH = rect.height (100% space-adaptive frame ratio)

      const pixelW = Math.max(280, Math.floor(targetW));
      const pixelH = Math.max(240, Math.floor(targetH));

      if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW;
        canvas.height = pixelH;
        setFrameDimensions((prev) => {
          if (prev.width === pixelW && prev.height === pixelH) {
            return prev;
          }
          return {
            width: pixelW,
            height: pixelH,
            ratio: (pixelW / pixelH).toFixed(2),
          };
        });
      }
    };

    updateCanvasDimensions();

    const resizeObserver = new ResizeObserver(() => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        updateCanvasDimensions();
      });
    });
    resizeObserver.observe(container);

    const onWindowResize = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        updateCanvasDimensions();
      });
    };
    window.addEventListener('resize', onWindowResize);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', onWindowResize);
    };
  }, [aspectRatioMode]);

  useEffect(() => {
    let animationFrameId: number;
    const historyPoints: { x: number; y: number }[] = [];

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) return;

      const cx = w / 2;
      const cy = Math.max(h * 0.78, h - 45); // Adaptively positioned relative to canvas height

      // Clear Canvas
      ctx.fillStyle = '#060b13';
      ctx.fillRect(0, 0, w, h);

      // Radar Range Rings & Azimuth Markings
      const maxRadius = Math.min(w * 0.44, cy - 35);
      const ringSteps = [0.25, 0.5, 0.75, 1.0];

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.lineWidth = 1;
      ringSteps.forEach((step) => {
        ctx.beginPath();
        ctx.arc(cx, cy, maxRadius * step, Math.PI, 2 * Math.PI);
        ctx.stroke();

        ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.fillText(`${(step * 5).toFixed(1)} km`, cx + 6, cy - maxRadius * step + 12);
      });

      // Azimuth Radial Guidelines (-45°, -30°, 0°, +30°, +45°)
      const angles = [-45, -30, -15, 0, 15, 30, 45];
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
      angles.forEach((ang) => {
        const rad = ((ang - 90) * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(rad) * maxRadius, cy + Math.sin(rad) * maxRadius);
        ctx.stroke();

        ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
        ctx.font = '9px JetBrains Mono, monospace';
        const labelX = cx + Math.cos(rad) * (maxRadius + 14);
        const labelY = cy + Math.sin(rad) * (maxRadius + 14);
        ctx.fillText(`${ang}°`, labelX - 8, labelY + 3);
      });

      // Radar Sweep Glow Beam (Continuous passive tactical radar scan)
      const sweepAngle = (engine.simTimeSec * 1.2) % (Math.PI);
      const sweepRad = Math.PI + sweepAngle;
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweepRad) * maxRadius, cy + Math.sin(sweepRad) * maxRadius);
      ctx.stroke();

      // Target range fixed for tactical view at ~3.5 km
      const targetRangeNorm = 0.72;
      const targetDistance = maxRadius * targetRangeNorm;

      // Current UAV-B World Angle
      const targetPanRad = ((engine.targetState.panDeg - 90) * Math.PI) / 180;
      const targetX = cx + Math.cos(targetPanRad) * targetDistance;
      const targetY = cy + Math.sin(targetPanRad) * targetDistance;

      // Push history
      historyPoints.push({ x: targetX, y: targetY });
      if (historyPoints.length > 90) {
        historyPoints.shift();
      }

      // Draw UAV-B Trajectory Trail
      if (historyPoints.length > 1) {
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(historyPoints[0].x, historyPoints[0].y);
        for (let i = 1; i < historyPoints.length; i++) {
          ctx.lineTo(historyPoints[i].x, historyPoints[i].y);
        }
        ctx.stroke();
      }

      // Current Camera Pan Gimbal Orientation
      const camPanEff = engine.cameraState.panDeg + engine.cameraState.jitterPanDeg;
      const camPanRad = ((camPanEff - 90) * Math.PI) / 180;
      const halfFovRad = ((engine.cameraConfig.fovXDeg / 2) * Math.PI) / 180;

      // Draw Camera FOV Cone (Frustum)
      const fovConeLength = maxRadius * 1.05;
      const fovLeftRad = camPanRad - halfFovRad;
      const fovRightRad = camPanRad + halfFovRad;

      const fovGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, fovConeLength);
      fovGrad.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
      fovGrad.addColorStop(0.7, 'rgba(16, 185, 129, 0.08)');
      fovGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');

      ctx.fillStyle = fovGrad;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, fovConeLength, fovLeftRad, fovRightRad);
      ctx.closePath();
      ctx.fill();

      // FOV Cone Bound Lines
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(fovLeftRad) * fovConeLength, cy + Math.sin(fovLeftRad) * fovConeLength);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(fovRightRad) * fovConeLength, cy + Math.sin(fovRightRad) * fovConeLength);
      ctx.stroke();

      // Gimbal Boresight Center Axis
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(camPanRad) * fovConeLength, cy + Math.sin(camPanRad) * fovConeLength);
      ctx.stroke();

      // Laser Communication Link Line (from UAV-A to UAV-B)
      const isLocked = engine.currentTelemetry.isLocked;
      const isOccluded = engine.targetState.isOccluded;

      if (!isOccluded) {
        if (isLocked) {
          // Fine laser link active (intense green beam)
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(targetX, targetY);
          ctx.stroke();

          // Laser beam glow
          ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)';
          ctx.lineWidth = 8;
          ctx.stroke();
        } else {
          // Searching / Misaligned (dashed amber/red line)
          ctx.strokeStyle = engine.currentTelemetry.groundTruthScreen.inFov ? '#f59e0b' : '#ef4444';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(targetX, targetY);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Draw Decoys if enabled
      if (engine.targetConfig.multiTargetClutter) {
        engine.targetState.decoys.forEach((decoy) => {
          const decoyPanRad = ((decoy.panDeg - 90) * Math.PI) / 180;
          const decoyDist = maxRadius * 0.68;
          const dx = cx + Math.cos(decoyPanRad) * decoyDist;
          const dy = cy + Math.sin(decoyPanRad) * decoyDist;

          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.arc(dx, dy, 3.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = 'rgba(244, 63, 94, 0.7)';
          ctx.font = '8px JetBrains Mono, monospace';
          ctx.fillText('CLUTTER', dx + 6, dy + 2);
        });
      }

      // Draw All Active Formation Beacons (1 to 5)
      const activeCount = Math.max(1, Math.min(5, engine.targetConfig.beaconCount || 1));
      const activeBeacons = (engine.targetState.allBeacons || []).slice(0, activeCount);
      const selIdx = Math.max(0, Math.min(activeBeacons.length - 1, engine.targetConfig.selectedBeaconIndex || 0));

      activeBeacons.forEach((beacon, idx) => {
        const isTracked = idx === selIdx;
        const bPanRad = ((beacon.panDeg - 90) * Math.PI) / 180;
        const bDist = maxRadius * (targetRangeNorm + (beacon.offsetTiltDeg || 0) * 0.015);
        const bx = cx + Math.cos(bPanRad) * bDist;
        const by = cy + Math.sin(bPanRad) * bDist;

        // Beacon dot
        ctx.fillStyle = beacon.color || '#38bdf8';
        ctx.beginPath();
        ctx.arc(bx, by, isTracked ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();

        if (isTracked) {
          // Optical Beacon pulse ring around tracked beacon
          const pulseRadius = 8 + 6 * Math.sin(engine.simTimeSec * 6);
          ctx.strokeStyle = isLocked ? '#22c55e' : (beacon.color || '#38bdf8');
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(bx, by, pulseRadius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#f8fafc';
          ctx.font = '10px JetBrains Mono, monospace';
          ctx.fillText(`TARGET: ${beacon.callsign} (${beacon.wavelengthNm}nm)`, bx + 12, by - 4);
          ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
          ctx.font = '9px JetBrains Mono, monospace';
          ctx.fillText(`AZ: ${beacon.panDeg.toFixed(1)}° | EL: ${beacon.tiltDeg.toFixed(1)}°`, bx + 12, by + 9);
        } else {
          ctx.fillStyle = 'rgba(203, 213, 225, 0.7)';
          ctx.font = '8px JetBrains Mono, monospace';
          ctx.fillText(`${beacon.callsign}`, bx + 7, by + 3);
        }
      });

      // Draw UAV-A (Receiver / Tracking Gimbal Terminal)
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText('UAV-A (GIMBAL PAT)', cx - 60, cy + 22);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [engine]);

  return (
    <div id="spatial-tactical-view" className="relative flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-950/90 border-b border-slate-800 backdrop-blur-md text-xs font-mono">
        <div className="flex items-center gap-2 text-white font-bold tracking-wider">
          <Radio className="w-4 h-4 text-emerald-400" />
          <span>LINK RADAR GEOMETRY</span>
          <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/50 text-[10px] text-cyan-400 font-normal">
            <Maximize2 className="w-2.5 h-2.5" />
            {aspectRatioMode === 'auto' ? `SPACE FIT ${frameDimensions.ratio}:1` : `${aspectRatioMode}`}
          </span>
        </div>

        {/* Frame Ratio Selector according to space */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-lg p-0.5 text-[11px]">
          <span className="text-slate-500 px-1 text-[10px]">RATIO:</span>
          {(['auto', '16/9', '16/10', '4/3', '1/1'] as AspectRatioMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setAspectRatioMode(mode)}
              title={mode === 'auto' ? 'Adapt frame ratio dynamically to fill available container space' : `Fix frame ratio to ${mode}`}
              className={`px-2 py-0.5 rounded font-mono text-[10px] transition-all cursor-pointer ${
                aspectRatioMode === mode
                  ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {mode === 'auto' ? 'Auto Space' : mode}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas Container Area */}
      <div
        ref={containerRef}
        className="relative flex-1 w-full min-h-[360px] bg-slate-950 overflow-hidden flex items-center justify-center"
      >
        <canvas
          ref={canvasRef}
          width={640}
          height={400}
          className="w-full h-full block"
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
        />

        {/* Legend Overlay */}
        <div className="absolute top-3 left-3 bg-slate-950/85 backdrop-blur-md p-3 rounded-xl border border-slate-800/80 shadow-lg font-mono text-[11px] space-y-1 text-slate-300 pointer-events-none">
          <div className="text-emerald-400 font-bold flex items-center gap-1.5 text-xs pb-1 border-b border-slate-800/60">
            <Navigation className="w-3.5 h-3.5" />
            <span>LINK RADAR SCOPE</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-400 text-[10px]">
            <span>NOMINAL RANGE:</span>
            <span className="text-slate-200 font-semibold">~3.5 km Line-of-Sight</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-400 text-[10px]">
            <span>TARGET BEARING:</span>
            <span className="text-cyan-400 font-bold">{engine.targetState.panDeg.toFixed(1)}° Azimuth</span>
          </div>
          <div className="flex justify-between gap-4 text-slate-400 text-[10px]">
            <span>FRAME RESOLUTION:</span>
            <span className="text-emerald-400 font-semibold tabular-nums">{frameDimensions.width}×{frameDimensions.height} ({frameDimensions.ratio}:1)</span>
          </div>
        </div>
      </div>
    </div>
  );
});
