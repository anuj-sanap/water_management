'use client';

import * as React from 'react';
import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Role } from '@prisma/client';
import { RoleBadge } from '@/components/role-badge';
import {
  User,
  KeyRound,
  Palette,
  Calculator,
  Sun,
  Moon,
  Laptop,
  Droplet,
  Gauge,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  updateProfileAction,
  changePasswordAction,
} from '@/app/actions/settings-actions';

interface EngineDocs {
  metresPerInch: number;
  litresPerCubicMetre: number;
  volumeToleranceM3: number;
  defaultAssumedVelocityInPerSec: number;
  defaultAssumedVelocityMPerSec: number;
  unaccountedNote: string;
  timeUnits: Record<string, number>;
  flowUnits: Record<string, number>;
  volumeUnits: Record<string, number>;
}

type SettingsTab = 'profile' | 'appearance' | 'calculations';
type ThemeOption = 'light' | 'dark' | 'system';
type DateRangeOption = '7' | '30' | 'month' | 'all';

interface SettingsViewProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  engineDocs: EngineDocs;
}

export function SettingsView({ user, engineDocs }: SettingsViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Active tab: 'profile' | 'appearance' | 'calculations'
  const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'calculations'>('profile');

  // Profile State
  const [name, setName] = useState(user.name);

  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Appearance State (persisted in localStorage)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [defaultUnit, setDefaultUnit] = useState<'m3' | 'L'>('m3');
  const [defaultDateRange, setDefaultDateRange] = useState<'7' | '30' | 'month' | 'all'>('30');

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const savedTheme = localStorage.getItem('hydrotrack_theme');
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
        setTheme(savedTheme);
      }

      const savedUnit = localStorage.getItem('hydrotrack_default_unit');
      if (savedUnit === 'm3' || savedUnit === 'L') setDefaultUnit(savedUnit);

      const savedRange = localStorage.getItem('hydrotrack_default_range');
      if (savedRange === '7' || savedRange === '30' || savedRange === 'month' || savedRange === 'all') {
        setDefaultDateRange(savedRange);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Password strength calculation
  const passwordChecks = useMemo(() => {
    return {
      length8: newPassword.length >= 8,
      length12: newPassword.length >= 12,
      hasLower: /[a-z]/.test(newPassword),
      hasUpper: /[A-Z]/.test(newPassword),
      hasNumber: /[0-9]/.test(newPassword),
      hasSpecial: /[^A-Za-z0-9]/.test(newPassword),
    };
  }, [newPassword]);

  const strengthScore = useMemo(() => {
    let score = 0;
    if (passwordChecks.length8) score += 1;
    if (passwordChecks.length12) score += 1;
    if (passwordChecks.hasLower) score += 1;
    if (passwordChecks.hasUpper) score += 1;
    if (passwordChecks.hasNumber) score += 1;
    if (passwordChecks.hasSpecial) score += 1;
    return score;
  }, [passwordChecks]);

  const getStrengthLabel = (score: number) => {
    if (score <= 2) return { label: 'Weak', color: 'bg-rose-500', text: 'text-rose-600' };
    if (score <= 4) return { label: 'Medium', color: 'bg-amber-500', text: 'text-amber-600' };
    if (score === 5) return { label: 'Good', color: 'bg-sky-500', text: 'text-sky-600' };
    return { label: 'Strong', color: 'bg-emerald-500', text: 'text-emerald-600' };
  };

  const strengthInfo = getStrengthLabel(strengthScore);

  // Handlers
  const handleUpdateName = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateProfileAction({ name });
      if (res.success) {
        toast.success('Profile name updated successfully');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to update name');
      }
    });
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New password and confirmation do not match');
      return;
    }
    if (strengthScore < 3) {
      toast.error('Please choose a stronger password matching the requirements below.');
      return;
    }

    startTransition(async () => {
      const res = await changePasswordAction({ currentPassword, newPassword });
      if (res.success) {
        toast.success('Password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast.error(res.error || 'Failed to change password');
      }
    });
  };

  const handleSavePreferences = () => {
    localStorage.setItem('hydrotrack_theme', theme);
    localStorage.setItem('hydrotrack_default_unit', defaultUnit);
    localStorage.setItem('hydrotrack_default_range', defaultDateRange);
    toast.success('Appearance & display preferences saved');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          System Settings & Documentation
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          User profile credentials, workspace appearance preferences, and authoritative calculation engine formulas.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex items-center gap-2 -mb-px">
          {([
            { id: 'profile', label: 'User Profile & Security', icon: User },
            { id: 'appearance', label: 'Appearance & Defaults', icon: Palette },
            { id: 'calculations', label: 'About Calculations & Formulas', icon: Calculator },
          ] as const).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-all cursor-pointer ${
                  isActive
                    ? 'border-sky-600 text-sky-600 dark:text-sky-400 dark:border-sky-400 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* TAB 1: PROFILE & SECURITY */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Profile Details Card */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <User className="w-4 h-4 text-sky-600" />
                Profile Information
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Update your display name. Email and system role are managed by project administration.
              </p>
            </div>

            <form onSubmit={handleUpdateName} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Full Name
                </label>
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Email Address (Read-only)
                </label>
                <Input
                  disabled
                  value={user.email}
                  className="text-xs bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed font-mono text-slate-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  Assigned System Role
                </label>
                <div>
                  <RoleBadge role={user.role} />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending || name === user.name}
                  className="bg-sky-600 hover:bg-sky-700 text-white text-xs cursor-pointer"
                >
                  {isPending ? 'Saving...' : 'Update Name'}
                </Button>
              </div>
            </form>
          </div>

          {/* Password Change Card with Strength Meter */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-sky-600" />
                Change Password
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Update your credentials. Actions are recorded in the immutable audit log.
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Current Password
                </label>
                <Input
                  required
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  New Password
                </label>
                <Input
                  required
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="text-xs"
                />
              </div>

              {/* Password Strength Meter */}
              {newPassword && (
                <div className="space-y-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 text-xs">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-slate-500 text-[11px]">Password Strength:</span>
                    <span className={`text-[11px] font-bold ${strengthInfo.text}`}>
                      {strengthInfo.label}
                    </span>
                  </div>

                  {/* Multi-segment strength bar */}
                  <div className="grid grid-cols-4 gap-1.5 h-1.5 w-full">
                    <div
                      className={`rounded-full transition-all ${
                        strengthScore >= 1 ? strengthInfo.color : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    />
                    <div
                      className={`rounded-full transition-all ${
                        strengthScore >= 3 ? strengthInfo.color : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    />
                    <div
                      className={`rounded-full transition-all ${
                        strengthScore >= 5 ? strengthInfo.color : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    />
                    <div
                      className={`rounded-full transition-all ${
                        strengthScore >= 6 ? strengthInfo.color : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    />
                  </div>

                  {/* Checklist */}
                  <div className="grid grid-cols-2 gap-1 pt-1 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${passwordChecks.length8 ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                        ✓
                      </span>
                      <span className={passwordChecks.length8 ? 'text-slate-800 dark:text-slate-200 font-medium' : 'text-slate-400'}>
                        At least 8 chars
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${passwordChecks.hasLower ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                        ✓
                      </span>
                      <span className={passwordChecks.hasLower ? 'text-slate-800 dark:text-slate-200 font-medium' : 'text-slate-400'}>
                        Lowercase letter
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${passwordChecks.hasUpper ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                        ✓
                      </span>
                      <span className={passwordChecks.hasUpper ? 'text-slate-800 dark:text-slate-200 font-medium' : 'text-slate-400'}>
                        Uppercase letter
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${passwordChecks.hasNumber ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                        ✓
                      </span>
                      <span className={passwordChecks.hasNumber ? 'text-slate-800 dark:text-slate-200 font-medium' : 'text-slate-400'}>
                        Number digit
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Confirm New Password
                </label>
                <Input
                  required
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending || !currentPassword || !newPassword}
                  className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs cursor-pointer"
                >
                  {isPending ? 'Updating...' : 'Change Password'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: APPEARANCE & REGIONAL */}
      {activeTab === 'appearance' && (
        <div className="max-w-2xl p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Palette className="w-4 h-4 text-sky-600" />
              Appearance & Telemetry Defaults
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Customize visual theme and default display parameters for your session.
            </p>
          </div>

          {/* Theme Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              Color Theme
            </label>
            <div className="grid grid-cols-3 gap-3">
              {([
                { id: 'light', label: 'Light', icon: Sun },
                { id: 'dark', label: 'Dark', icon: Moon },
                { id: 'system', label: 'System', icon: Laptop },
              ] as const).map((t) => {
                const Icon = t.icon;
                const isSelected = theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id as ThemeOption)}
                    className={`p-3 rounded-2xl border text-xs font-semibold flex flex-col items-center gap-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-sky-600 bg-sky-50/50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 ring-2 ring-sky-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Default Volume Unit */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              Default Volume Presentation Unit
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDefaultUnit('m3')}
                className={`p-3 rounded-2xl border text-xs text-left transition-all cursor-pointer ${
                  defaultUnit === 'm3'
                    ? 'border-sky-600 bg-sky-50/50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 ring-2 ring-sky-500/20'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div className="font-bold">Cubic Metres (m³)</div>
                <div className="text-[11px] text-slate-500 mt-0.5">SI standard for bulk water balance</div>
              </button>

              <button
                type="button"
                onClick={() => setDefaultUnit('L')}
                className={`p-3 rounded-2xl border text-xs text-left transition-all cursor-pointer ${
                  defaultUnit === 'L'
                    ? 'border-sky-600 bg-sky-50/50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 ring-2 ring-sky-500/20'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div className="font-bold">Litres (L)</div>
                <div className="text-[11px] text-slate-500 mt-0.5">1 m³ = 1,000 L exactly</div>
              </button>
            </div>
          </div>

          {/* Default Date Range Filter */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              Default Telemetry Date Window
            </label>
            <select
              value={defaultDateRange}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '7' || value === '30' || value === 'month' || value === 'all') {
                  setDefaultDateRange(value as DateRangeOption);
                }
              }}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200"
            >
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days (Standard Continuous Window)</option>
              <option value="month">This Month</option>
              <option value="all">All Available History</option>
            </select>
          </div>

          <div className="pt-2">
            <Button
              type="button"
              onClick={handleSavePreferences}
              className="bg-sky-600 hover:bg-sky-700 text-white text-xs cursor-pointer"
            >
              Save Preferences
            </Button>
          </div>
        </div>
      )}

      {/* TAB 3: ABOUT CALCULATIONS (READ-ONLY TECHNICAL REFERENCE) */}
      {activeTab === 'calculations' && (
        <div className="space-y-6">
          {/* Top Engine Constants Card */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-sky-600" />
                  Engine Constants & Physical Conversion Factors
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Authoritative constants pulled live from the calculation engine (<code className="font-mono text-sky-600">waterCalculations.js</code>).
                </p>
              </div>
              <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Live Engine Linked
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  International Inch
                </div>
                <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-1">
                  {engineDocs.metresPerInch} m
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">1 in = 0.0254 m exact</div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  Litres per Cubic Metre
                </div>
                <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-1">
                  {engineDocs.litresPerCubicMetre} L
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">1 m³ = 1,000 L exact</div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  Assumed Velocity Default
                </div>
                <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-1">
                  {engineDocs.defaultAssumedVelocityInPerSec} in/s
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">≈ {engineDocs.defaultAssumedVelocityMPerSec} m/s</div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  Volume Noise Tolerance
                </div>
                <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-1">
                  1e-9 m³
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Floating-point epsilon (1 mL)</div>
              </div>
            </div>
          </div>

          {/* Unaccounted Water Note Banner */}
          <div className="p-5 rounded-3xl bg-gradient-to-r from-sky-50 to-indigo-50 dark:from-sky-950/40 dark:to-indigo-950/40 border border-sky-200 dark:border-sky-800/60 space-y-2">
            <div className="flex items-center gap-2">
              <Droplet className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              <h3 className="text-sm font-bold text-sky-900 dark:text-sky-200">
                Authoritative Engine Notice on Unaccounted Water
              </h3>
            </div>
            <p className="text-xs text-sky-800 dark:text-sky-300 leading-relaxed font-medium">
              &ldquo;{engineDocs.unaccountedNote}&rdquo;
            </p>
          </div>

          {/* Method Calculations Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Flow Meter Card */}
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  1. Flow Meter Method
                </h3>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 font-mono text-xs space-y-1">
                <div className="text-sky-600 dark:text-sky-400 font-bold">V = Q × t</div>
                <div className="text-[11px] text-slate-500">Volume = Flow Rate × Duration</div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Direct integration of metered telemetry. Flow rate is converted to SI units (<span className="font-mono">m³/s</span>) and duration to seconds (<span className="font-mono">s</span>).
              </p>

              <div className="text-[11px] space-y-1 border-t pt-2 text-slate-500">
                <div className="font-semibold text-slate-700 dark:text-slate-300">Supported Units:</div>
                <div>• m³/s, L/s, L/min, m³/h, L/h</div>
                <div>• Time: seconds (s), minutes (min), hours (h)</div>
              </div>
            </div>

            {/* Pipe Discharge Card */}
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  2. Pipe Discharge Method
                </h3>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 font-mono text-xs space-y-1">
                <div className="text-sky-600 dark:text-sky-400 font-bold">A = (π · d²) / 4</div>
                <div className="text-sky-600 dark:text-sky-400 font-bold">V = A × v × t</div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Calculates full-bore pipe volumetric discharge. Diameter in inches is converted via <span className="font-mono">{engineDocs.metresPerInch} m/in</span>.
              </p>

              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-800 dark:text-amber-300">
                <strong>Assumed Velocity Notice:</strong> When no velocity is measured on site, the project&apos;s assumed velocity (<span className="font-mono">{engineDocs.defaultAssumedVelocityInPerSec} in/s</span>) is used. This is an assumption, not a physical measurement.
              </div>
            </div>

            {/* Direct Volume Entry */}
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <Droplet className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  3. Direct Volume Entry
                </h3>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 font-mono text-xs space-y-1">
                <div className="text-sky-600 dark:text-sky-400 font-bold">V = Volume (m³)</div>
                <div className="text-[11px] text-slate-500">V = Litres / 1,000</div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                For calibrated delivery batches, pre-measured bowser dispenses, or verified tanker deliveries. Entered units are converted without rounding distortion.
              </p>
            </div>
          </div>

          {/* Water Balance & Deep Explanation */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Water Balance Equations & Non-Wastage Principle
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Unaccounted Water (m³)
                </div>
                <div className="font-mono text-xs text-sky-600 dark:text-sky-400 font-bold">
                  Unaccounted Volume = Supplied Volume (m³) - Recorded Consumption (m³)
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Calculated by subtracting total consumption from delivered supplies across the defined operational date range.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Unaccounted Percentage (%)
                </div>
                <div className="font-mono text-xs text-sky-600 dark:text-sky-400 font-bold">
                  Unaccounted % = (Unaccounted m³ / Supplied m³) × 100
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Expressed relative to total supply. When consumption exceeds supply, status is flagged as <span className="font-mono font-semibold">DATA_CHECK</span>.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-2">
              <h4 className="font-bold text-slate-900 dark:text-white">
                Why Unaccounted Water Is NOT Necessarily Wastage:
              </h4>
              <p>
                In civil infrastructure and high-rise construction, water is routinely consumed in processes that cannot be individually metered in real time:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-500 dark:text-slate-400">
                <li>
                  <strong>Structural Concrete Hydration & Curing:</strong> Continual soaking of slabs, burlap wrapping, and ponding absorb high volumes that evaporate or become chemically bound into calcium silicate hydrate crystals.
                </li>
                <li>
                  <strong>Atmospheric Evaporation & Wind Drift:</strong> High-ambient summer operations cause rapid surface vaporization during dust suppression and batching yard spraying.
                </li>
                <li>
                  <strong>Line Charging & Sump Storage:</strong> Filling extensive subterranean pipe networks, booster header tanks, and settling basins temporarily sequesters water that hasn&apos;t yet reached terminal discharge points.
                </li>
                <li>
                  <strong>Meter Calibration Variances:</strong> Ultrasonic and mechanical turbine flow meters operate within ±2% to ±5% accuracy bands across turbulent site conditions.
                </li>
              </ul>
              <p className="pt-1 text-[11px] italic text-slate-400">
                Consequently, HydroTrack enforces neutral engineering terminology: variances are flagged for investigation and verification, never presumed to be loss or waste.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
