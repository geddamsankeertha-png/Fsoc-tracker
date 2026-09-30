/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FSOCSimulationEngine } from './simulation/simulationEngine';
import { WebcamTrackingEngine } from './simulation/webcamTrackingEngine';
import { SyntheticCameraFeed } from './components/SyntheticCameraFeed';
import { SpatialTacticalView } from './components/SpatialTacticalView';
import { TelemetryStripCharts } from './components/TelemetryStripCharts';
import { ControlDashboard } from './components/ControlDashboard';
import { PerformanceLogPanel } from './components/PerformanceLogPanel';
import { PerformanceReportModal } from './components/PerformanceReportModal';
import { LiveWebcamView } from './components/LiveWebcamView';
import { WebcamGimbalTacticalView } from './components/WebcamGimbalTacticalView';
import { LandingPage } from './components/LandingPage';
import { ApplicationMode } from './types';
import { exportTelemetryCSV, exportTelemetryJSON } from './utils/telemetryExport';
import {
  Crosshair,
  Camera,
  Globe,
  Home,
  FileText,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  Radio,
} from 'lucide-react';

export default function App() {
  // Mode selection: Landing Overview vs Virtual Simulation vs Live Webcam Mode
  const [appMode, setAppMode] = useState<ApplicationMode>('landing');

  // Persistent Virtual Simulation Engine instance
  const engine = useMemo(() => new FSOCSimulationEngine(), []);

  // Persistent Live Webcam Tracking Engine instance
  const webcamEngine = useMemo(() => new WebcamTrackingEngine(), []);

  // UI States
  const [isPerformanceReportOpen, setIsPerformanceReportOpen] = useState(false);
  const [viewLayout, setViewLayout] = useState<'dual' | 'camera_focus' | 'tactical_focus'>('dual');
  const [, setFrameTick] = useState(0);

  const handleStateChange = useCallback(() => {
    setFrameTick((t) => t + 1);
  }, []);

  // Subscribe to engine state/configuration events for immediate synchronization
  useEffect(() => {
    const unsubscribe = engine.subscribe(() => {
      setFrameTick((t) => t + 1);
    });
    return unsubscribe;
  }, [engine]);

  // Main high-performance simulation loop (active when in virtual_sim mode)
  useEffect(() => {
    if (appMode !== 'virtual_sim') return;

    let lastTime = performance.now();
    let animationFrameId: number;

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // Advance simulation physics, perception & control
      engine.step(dt);
      // Smooth 10 FPS header stats update to eliminate React render buffering and keep buttons snappy
      if (engine.frameCount % 6 === 0) {
        setFrameTick((t) => t + 1);
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [engine, appMode]);

  // Smooth polling interval for header metrics during Live Webcam mode
  useEffect(() => {
    if (appMode !== 'live_webcam') return;
    const interval = setInterval(() => {
      setFrameTick((t) => t + 1);
    }, 100);
    return () => clearInterval(interval);
  }, [appMode]);

  const telemetry = engine.currentTelemetry;
  const stats = engine.getPerformanceStats();
  const [exportFeedback, setExportFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const activeHistoryLength =
    appMode === 'virtual_sim'
      ? engine.telemetryHistory.length
      : webcamEngine.telemetryHistory.length;

  const handleExportTelemetry = (format: 'csv' | 'json') => {
    if (appMode === 'live_webcam') {
      if (format === 'csv') {
        webcamEngine.exportCSV();
        setExportFeedback({
          type: 'success',
          message: `Exported ${webcamEngine.telemetryHistory.length} live webcam frames to CSV`,
        });
      } else {
        const payload = {
          format: 'fsoc-pat-webcam-telemetry-v1',
          exportedAt: new Date().toISOString(),
          totalRecords: webcamEngine.telemetryHistory.length,
          telemetry: webcamEngine.telemetryHistory,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: 'application/json;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fsoc_webcam_telemetry_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 250);
        setExportFeedback({
          type: 'success',
          message: `Exported ${webcamEngine.telemetryHistory.length} live webcam frames to JSON`,
        });
      }
      setTimeout(() => setExportFeedback(null), 4000);
      return;
    }

    const history = engine?.telemetryHistory || [];
    const options = {
      scenarioName: engine.targetConfig.trajectory,
      detectorMode: engine.perceptionMode,
      metadata: {
        seed: engine.currentSeed,
        simTimeSec: Number(engine.simTimeSec.toFixed(3)),
        isLocked: engine.currentTelemetry.isLocked,
      },
    };

    const result = format === 'csv'
      ? exportTelemetryCSV(history, options)
      : exportTelemetryJSON(history, options);

    if (result.success) {
      setExportFeedback({
        type: 'success',
        message: `Exported ${result.recordCount} records to ${result.filename}`,
      });
    } else {
      setExportFeedback({
        type: 'error',
        message: result.error || 'Failed to export telemetry',
      });
    }

    setTimeout(() => {
      setExportFeedback(null);
    }, 4000);
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-950/95 border-b border-slate-800/90 backdrop-blur-md px-4 lg:px-6 py-2.5 shadow-lg shadow-black/40">
        <div className="max-w-[1700px] mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Brand Wordmark (Clickable to return to Overview) */}
          <button
            onClick={() => setAppMode('landing')}
            className="flex items-center gap-3 text-left cursor-pointer group transition-all"
            title="Return to Overview"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 via-blue-600/20 to-indigo-600/30 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-sm group-hover:border-cyan-400 group-hover:scale-105 transition-all">
              <Crosshair className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm md:text-base font-bold tracking-tight text-white font-mono group-hover:text-cyan-300 transition-colors">
                  FSOC Coarse Alignment Tracker
                </span>
                
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block font-mono">
                Free-Space Optical Communications · Visual Servoing Platform
              </p>
            </div>
          </button>

          {/* Operational Platform Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs">
            <button
              id="mode-btn-landing"
              onClick={() => setAppMode('landing')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                appMode === 'landing'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Overview</span>
            </button>
            <button
              id="mode-btn-virtual-sim"
              onClick={() => setAppMode('virtual_sim')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                appMode === 'virtual_sim'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Virtual Simulation</span>
            </button>
            <button
              id="mode-btn-live-webcam"
              onClick={() => setAppMode('live_webcam')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                appMode === 'live_webcam'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Live Webcam Mode</span>
            </button>
          </div>

          {/* Quick Metrics Bar (Virtual Sim Mode) */}
          {appMode === 'virtual_sim' && (
            <div className="hidden xl:flex items-center gap-6 font-mono text-xs border-x border-slate-800 px-4">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">POINTING ERROR:</span>
                <span
                  className={`font-bold tabular-nums ${
                    telemetry.angularErrorDeg < 0.22 ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {telemetry.angularErrorDeg.toFixed(3)}° ({telemetry.angularErrorMrad.toFixed(1)} mrad)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">LOCK RETENTION:</span>
                <span className="text-emerald-400 font-bold tabular-nums">{stats.lockRetentionRate}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">PERCEPTION:</span>
                <span className="text-cyan-400 font-semibold uppercase">{engine.perceptionMode.replace('_', ' ')}</span>
              </div>
            </div>
          )}

          {/* Quick Metrics Bar (Live Webcam Mode) */}
          {appMode === 'live_webcam' && (
            <div className="hidden xl:flex items-center gap-6 font-mono text-xs border-x border-slate-800 px-4">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">LIVE SENSOR:</span>
                <span className={`font-bold ${webcamEngine.isStreaming ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {webcamEngine.isStreaming ? 'STREAMING' : 'STANDBY'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">FSM STATE:</span>
                <span className="text-cyan-400 font-bold">{webcamEngine.fsmState}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">PERCEPTION:</span>
                <span className="text-cyan-400 font-semibold uppercase">{webcamEngine.perceptionMode.replace('_', ' ')}</span>
              </div>
            </div>
          )}

          {/* Quick Info Bar (Landing Mode) */}
          {appMode === 'landing' && (
            <div className="hidden xl:flex items-center gap-5 font-mono text-xs border-x border-slate-800 px-4 text-slate-400">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">SYSTEM:</span>
                <span className="text-cyan-400 font-semibold">PAT V2.4 MIL-STD</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">CONE:</span>
                <span className="text-emerald-400 font-bold">&lt; 0.22° FINE LINK</span>
              </div>
            </div>
          )}

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              id="header-btn-perf-report"
              onClick={() => setIsPerformanceReportOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 text-xs font-mono font-semibold transition-all cursor-pointer shadow-sm hover:shadow-emerald-500/10"
              title="Open Automated Performance Report & System Diagnostics"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Performance Report</span>
              <span className="sm:hidden">Report</span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                id="header-btn-export-csv"
                onClick={() => handleExportTelemetry('csv')}
                disabled={activeHistoryLength === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                  activeHistoryLength === 0
                    ? 'bg-slate-900/50 text-slate-600 border-slate-800/60 cursor-not-allowed'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700 cursor-pointer hover:text-white'
                }`}
                title={
                  activeHistoryLength === 0
                    ? 'No telemetry data recorded yet'
                    : `Download Telemetry CSV (${activeHistoryLength} samples)`
                }
              >
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden md:inline">Export CSV</span>
              </button>

              <button
                id="header-btn-export-json"
                onClick={() => handleExportTelemetry('json')}
                disabled={activeHistoryLength === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                  activeHistoryLength === 0
                    ? 'bg-slate-900/50 text-slate-600 border-slate-800/60 cursor-not-allowed'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700 cursor-pointer hover:text-white'
                }`}
                title={
                  activeHistoryLength === 0
                    ? 'No telemetry data recorded yet'
                    : `Download Telemetry JSON (${activeHistoryLength} samples)`
                }
              >
                <FileCode className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden md:inline">Export JSON</span>
              </button>
            </div>
          </div>
        </div>

        {/* Global Export Status Toast */}
        {exportFeedback && (
          <div
            id="header-export-feedback"
            className={`max-w-[1700px] mx-auto mt-2 px-3 py-1.5 rounded-lg text-xs font-mono flex items-center justify-between border ${
              exportFeedback.type === 'success'
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                : 'bg-rose-950/80 text-rose-300 border-rose-800/60'
            }`}
          >
            <div className="flex items-center gap-2">
              {exportFeedback.type === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              )}
              <span>{exportFeedback.message}</span>
            </div>
            <button
              onClick={() => setExportFeedback(null)}
              className="text-slate-400 hover:text-white text-xs px-1"
            >
              ✕
            </button>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto p-3 sm:p-4 lg:p-6 space-y-4">
        {/* ======================= LANDING PAGE OVERVIEW ======================= */}
        {appMode === 'landing' && (
          <LandingPage
            onSelectMode={setAppMode}
            onOpenPerformanceReport={() => setIsPerformanceReportOpen(true)}
          />
        )}

        {/* ======================= VIRTUAL SIMULATION MODE ======================= */}
        {appMode === 'virtual_sim' && (
          <>
            {/* Layout Mode Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-400 px-1">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-semibold text-[11px]">VIEWPORT:</span>
                <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setViewLayout('dual')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                      viewLayout === 'dual'
                        ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Dual Sensor + Tactical</span>
                  </button>
                  <button
                    onClick={() => setViewLayout('camera_focus')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                      viewLayout === 'camera_focus'
                        ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>Optical Sensor Focus</span>
                  </button>
                  <button
                    onClick={() => setViewLayout('tactical_focus')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                      viewLayout === 'tactical_focus'
                        ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Tactical Radar Focus</span>
                  </button>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Fine Divergence Core (&lt;0.22°)
                </span>
                <span className="flex items-center gap-1.5 text-purple-400">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  Kalman Lookahead Velocity
                </span>
              </div>
            </div>

            {/* Primary Views Section */}
            {viewLayout === 'dual' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left / Upper: Synthetic Optical Sensor View */}
                <div className="lg:col-span-7 xl:col-span-8 flex flex-col">
                  <SyntheticCameraFeed engine={engine} />
                </div>

                {/* Right: Spatial Tactical Geometry Map */}
                <div className="lg:col-span-5 xl:col-span-4 flex flex-col h-full">
                  <SpatialTacticalView engine={engine} />
                </div>
              </div>
            )}

            {viewLayout === 'camera_focus' && (
              <div className="w-full">
                <SyntheticCameraFeed engine={engine} />
              </div>
            )}

            {viewLayout === 'tactical_focus' && (
              <div className="w-full max-w-4xl mx-auto">
                <SpatialTacticalView engine={engine} />
              </div>
            )}

            {/* Telemetry Strip Charts & Analysis */}
            <div className="w-full">
              <TelemetryStripCharts engine={engine} />
            </div>

            {/* Interactive Control Deck */}
            <div className="w-full">
              <ControlDashboard
                engine={engine}
                onStateChange={handleStateChange}
              />
            </div>

            {/* Automated Performance Log & Empirical Diagnostic Panel */}
            <div className="w-full">
              <PerformanceLogPanel
                engine={engine}
                onOpenFullReportModal={() => setIsPerformanceReportOpen(true)}
              />
            </div>
          </>
        )}

        {/* ======================= LIVE WEBCAM MODE ======================= */}
        {appMode === 'live_webcam' && (
          <div className="space-y-4">
            {/* Live Camera View with HUD & Controls */}
            <LiveWebcamView
              engine={webcamEngine}
            />

            {/* Virtual Gimbal Kinematics & Tactical Telemetry */}
            <WebcamGimbalTacticalView engine={webcamEngine} />
          </div>
        )}
      </main>

      {/* Footer with Royal Polish */}
      <footer className="mt-auto border-t border-amber-500/20 bg-slate-950/90 px-4 py-4 text-center text-xs font-mono text-slate-400">
        <div className="max-w-[1700px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-white font-semibold">FSOC PAT Camera Tracking System</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">MIL-STD Coarse Alignment &amp; Visual Servoing Platform</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400">
            <button
              onClick={() => setAppMode('landing')}
              className={`hover:text-amber-300 transition-colors cursor-pointer ${appMode === 'landing' ? 'text-amber-400 font-bold' : ''}`}
            >
              Overview
            </button>
            <span>·</span>
            <button
              onClick={() => setAppMode('virtual_sim')}
              className={`hover:text-amber-300 transition-colors cursor-pointer ${appMode === 'virtual_sim' ? 'text-amber-400 font-bold' : ''}`}
            >
              Virtual Simulation
            </button>
            <span>·</span>
            <button
              onClick={() => setAppMode('live_webcam')}
              className={`hover:text-amber-300 transition-colors cursor-pointer ${appMode === 'live_webcam' ? 'text-amber-400 font-bold' : ''}`}
            >
              Live Webcam
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <PerformanceReportModal
        isOpen={isPerformanceReportOpen}
        onClose={() => setIsPerformanceReportOpen(false)}
        engine={engine}
      />

    </div>
  );
}
