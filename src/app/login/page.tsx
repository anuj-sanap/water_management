import { Suspense } from 'react';
import LoginForm from './login-form';
import { Droplets, Gauge, ShieldCheck, Activity, Waves } from 'lucide-react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | HydroTrack Construction Water Management',
  description: 'Sign in to HydroTrack to monitor site water balance, pipe telemetry, and compliance audits.',
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-slate-950">
      {/* LEFT PANEL: Branded Water-Themed Visual Panel (Hidden on small screens, split layout on desktop) */}
      <div className="lg:w-1/2 relative bg-gradient-to-br from-cyan-900 via-sky-900 to-slate-950 text-white flex flex-col justify-between p-8 sm:p-12 lg:p-16 overflow-hidden">
        {/* Decorative background glow & water wave effects */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] opacity-10 pointer-events-none" />

        {/* Top: Branding */}
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-cyan-200 text-xs font-semibold tracking-wide mb-6">
            <Droplets className="w-4 h-4 text-cyan-400" />
            <span>HydroTrack Platform</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight text-white mb-4">
            Construction Site <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-blue-200">
              Water Accounting & Auditing
            </span>
          </h1>

          <p className="text-cyan-100/80 text-sm sm:text-base max-w-lg leading-relaxed">
            Eliminate unmetered waste, detect pipeline anomalies, and maintain tamper-proof compliance across civil engineering phases.
          </p>
        </div>

        {/* Center: Key Feature Highlights */}
        <div className="relative z-10 my-8 sm:my-12 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20 transition-all">
            <div className="w-8 h-8 rounded-xl bg-cyan-400/20 flex items-center justify-center text-cyan-300 mb-3">
              <Gauge className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-sm text-white mb-1">Calculation Engine</h3>
            <p className="text-xs text-cyan-100/70 leading-normal">
              Accurate flow meters, pipe diameter velocity models, and batch tank volumes.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20 transition-all">
            <div className="w-8 h-8 rounded-xl bg-sky-400/20 flex items-center justify-center text-sky-300 mb-3">
              <Activity className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-sm text-white mb-1">Balance & Anomalies</h3>
            <p className="text-xs text-cyan-100/70 leading-normal">
              Detect daily deficit drawdowns and high-consumption raft pour spikes automatically.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20 transition-all">
            <div className="w-8 h-8 rounded-xl bg-amber-400/20 flex items-center justify-center text-amber-300 mb-3">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-sm text-white mb-1">48-Hour Log Window</h3>
            <p className="text-xs text-cyan-100/70 leading-normal">
              Site engineers log entries with strict 48-hour edit window for data integrity.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20 transition-all">
            <div className="w-8 h-8 rounded-xl bg-emerald-400/20 flex items-center justify-center text-emerald-300 mb-3">
              <Waves className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-sm text-white mb-1">Auditor Read-Only Mode</h3>
            <p className="text-xs text-cyan-100/70 leading-normal">
              Independent audit trail and water balance exports with zero tamper risk.
            </p>
          </div>
        </div>

        {/* Bottom: Status ticker */}
        <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-cyan-200/60 font-mono">
          <span>SYSTEM: v1.0.0 ACTIVE</span>
          <span>DATABASE: POSTGRES-COMPATIBLE SQLITE</span>
        </div>
      </div>

      {/* RIGHT PANEL / MAIN COLUMN: Login Form Area */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-12 lg:p-16">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200/80 dark:border-slate-800">
          <Suspense fallback={<div className="h-96 flex items-center justify-center text-slate-400">Loading workspace...</div>}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
