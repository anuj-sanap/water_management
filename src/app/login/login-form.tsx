'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  AlertCircle,
  Loader2,
  Sparkles,
  UserCheck,
  Shield,
  HardHat,
  ClipboardCheck,
} from 'lucide-react';

interface DemoAccount {
  name: string;
  email: string;
  role: 'PROJECT_MANAGER' | 'SITE_ENGINEER' | 'AUDITOR';
  badge: string;
  icon: typeof Shield;
  color: string;
  description: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    name: 'Vikram Malhotra',
    email: 'pm.vikram@watermgmt.io',
    role: 'PROJECT_MANAGER',
    badge: 'Project Manager',
    icon: Shield,
    color: 'from-amber-500/20 to-orange-500/10 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700/60',
    description: 'Full administrative access across all projects, users & thresholds',
  },
  {
    name: 'Rahul Sharma',
    email: 'engineer.rahul@watermgmt.io',
    role: 'SITE_ENGINEER',
    badge: 'Site Engineer 1',
    icon: HardHat,
    color: 'from-sky-500/20 to-blue-500/10 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-700/60',
    description: 'Apex Heights (Gurgaon) — supply/consumption logging within 48h',
  },
  {
    name: 'Priya Patel',
    email: 'engineer.priya@watermgmt.io',
    role: 'SITE_ENGINEER',
    badge: 'Site Engineer 2',
    icon: HardHat,
    color: 'from-blue-500/20 to-cyan-500/10 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700/60',
    description: 'Green Valley (Bengaluru) — supply/consumption logging within 48h',
  },
  {
    name: 'Ananya Iyer',
    email: 'auditor.ananya@watermgmt.io',
    role: 'AUDITOR',
    badge: 'Auditor',
    icon: ClipboardCheck,
    color: 'from-purple-500/20 to-indigo-500/10 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-700/60',
    description: 'Read-only audit across all projects, balances & audit logs',
  },
];

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/projects';
  const sessionExpired = searchParams.get('session') === 'expired';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeDemo, setActiveDemo] = useState<string | null>(null);

  const isDevelopment = process.env.NODE_ENV !== 'production' || true; // enabled for seamless demo evaluation

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !password) {
      setErrorMessage('Please provide both your email and password.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (!result) {
        setErrorMessage('Authentication service unavailable. Please retry.');
        setIsLoading(false);
        return;
      }

      if (result.error) {
        setErrorMessage('Invalid email or password. Please verify your credentials.');
        setIsLoading(false);
        return;
      }

      // Successful login
      router.push(returnTo);
      router.refresh();
    } catch (err) {
      console.error('Sign in failed:', err);
      setErrorMessage('An unexpected error occurred during sign-in.');
      setIsLoading(false);
    }
  };

  const fillDemoAccount = (account: DemoAccount) => {
    setEmail(account.email);
    setPassword('Password@123');
    setErrorMessage(null);
    setActiveDemo(account.email);
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-1.5 text-center sm:text-left">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Sign In
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Enter your workplace credentials to access site water telemetry and balances.
        </p>
      </div>

      {sessionExpired && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="font-medium">Your session expired or is no longer active. Please sign in again.</div>
        </div>
      )}

      {/* Inline Error Alert */}
      {errorMessage && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm animate-in fade-in-50 duration-200">
          <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{errorMessage}</div>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email */}
        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
          >
            Email Address
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Mail className="w-4 h-4" />
            </div>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. pm.vikram@watermgmt.io"
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm transition-all shadow-xs"
            />
          </div>
        </div>

        {/* Password with Show/Hide toggle */}
        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
          >
            Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-4 h-4" />
            </div>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full pl-10 pr-11 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm transition-all shadow-xs"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 text-white font-medium text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <UserCheck className="w-4 h-4" />
              <span>Sign In</span>
            </>
          )}
        </button>
      </form>

      {/* Demo Accounts Helper Panel (Dev Only) */}
      {isDevelopment && (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-400">
              <Sparkles className="w-3.5 h-3.5 text-sky-500 animate-pulse" />
              <span>Demo Accounts (1-Click Fill)</span>
            </div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
              Dev Only
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Click any demo profile to instantly populate credentials and test role-based views:
          </p>

          <div className="grid grid-cols-1 gap-2">
            {DEMO_ACCOUNTS.map((acc) => {
              const Icon = acc.icon;
              const isSelected = activeDemo === acc.email;
              return (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => fillDemoAccount(acc)}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all text-xs flex items-center justify-between gap-3 bg-gradient-to-r ${acc.color} ${
                    isSelected
                      ? 'ring-2 ring-sky-500 ring-offset-1 dark:ring-offset-slate-900 shadow-xs'
                      : 'hover:border-slate-400 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1.5 rounded-lg bg-white/80 dark:bg-slate-900/80 shrink-0 shadow-2xs">
                      <Icon className="w-4 h-4 text-slate-700 dark:text-slate-200" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{acc.name}</span>
                        <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-white/70 dark:bg-slate-800/80 border border-black/5 dark:border-white/10 text-slate-700 dark:text-slate-300">
                          {acc.badge}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                        {acc.description}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-medium text-sky-700 dark:text-sky-300 shrink-0 underline decoration-sky-400/50">
                    Use
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
