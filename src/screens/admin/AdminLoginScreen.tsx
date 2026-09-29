import React, { useState } from 'react';
import { Shield, Lock, Mail, Eye, EyeOff, AlertCircle, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { auth } from '../../config/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { AuthService } from '../../services/authService';

interface AdminLoginScreenProps {
  onSuccess?: () => void;
  onExit?: () => void;
}

export const AdminLoginScreen: React.FC<AdminLoginScreenProps> = ({ onSuccess, onExit }) => {
  const { loginWithToken, isLoading: isContextLoading, error: contextError } = useAdmin();

  const [email, setEmail] = useState('ceo.mrfutkar@gmail.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const user = await AuthService.signInWithGoogle();
      const idToken = await user.getIdToken();
      const res = await loginWithToken(idToken);
      if (res.success) {
        onSuccess?.();
      } else {
        setErrorMessage(res.message || 'Admin access is not authorized for this account.');
      }
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setErrorMessage(err?.message || 'Google sign-in failed. Please verify credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Please enter the Super Admin email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your Super Admin password.');
      return;
    }

    setIsLoading(true);
    try {
      // 1. Authoritative Firebase Authentication (Email/Password)
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      
      // 2. Obtain real cryptographically signed Firebase ID token
      const idToken = await userCredential.user.getIdToken();

      // 3. Authenticate session against backend server via Bearer token
      const res = await loginWithToken(idToken);
      if (res.success) {
        onSuccess?.();
      } else {
        setErrorMessage(res.message || 'Admin access is not authorized for this account.');
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setErrorMessage(
          'Email/Password sign-in provider is disabled in Firebase for project project-f07feeac-9008-4c6b-823. Please use "Sign in with Google (Super Admin)" above.'
        );
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-email'
      ) {
        console.warn('Firebase Auth: Invalid credentials entered for Super Admin.');
        setErrorMessage('Invalid credentials or unauthorized account. Please verify email and password or sign in with Google.');
      } else if (code === 'auth/user-disabled') {
        console.warn('Firebase Auth: Administrator account has been disabled.');
        setErrorMessage('This administrator account has been disabled. Please contact system governance.');
      } else if (code === 'auth/too-many-requests') {
        console.warn('Firebase Auth: Too many requests, rate limited.');
        setErrorMessage('Too many failed sign-in attempts. Please wait a moment and try again.');
      } else {
        console.error('Firebase Auth unexpected sign-in error:', err);
        setErrorMessage(err?.message || 'Authentication failed. Please verify credentials and network.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-stone-100 flex flex-col justify-between selection:bg-amber-500/30 selection:text-amber-200">
      {/* Top Header */}
      <div className="p-6 flex items-center justify-between border-b border-stone-800/60 bg-stone-900/30 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-inner">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-widest text-amber-400 uppercase">MR FUTKAR</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                SUPER ADMIN
              </span>
            </div>
            <p className="text-[11px] text-stone-400 font-medium">B2B Platform Governance & Security</p>
          </div>
        </div>

        {onExit && (
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-stone-400 hover:text-stone-200 bg-stone-900/80 hover:bg-stone-800 rounded-lg border border-stone-800 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Store Portal</span>
          </button>
        )}
      </div>

      {/* Main Login Card */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-stone-900/60 border border-stone-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          {/* Subtle Ambient Glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

          {/* Heading */}
          <div className="mb-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-3 text-amber-400 shadow-inner">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-white">Super Admin Access Gate</h1>
            <p className="text-xs text-stone-400 mt-1">
              Authorized personnel only. Authenticates via Firebase Identity with server-verified RBAC.
            </p>
          </div>

          {/* Error Banner */}
          {(errorMessage || contextError) && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs font-medium leading-relaxed">
                {errorMessage || contextError}
              </div>
            </div>
          )}

          {/* Primary Firebase Google Sign-In */}
          <div className="mb-4">
            <button
              type="button"
              disabled={isLoading || isContextLoading}
              onClick={handleGoogleSignIn}
              className="w-full bg-white hover:bg-stone-100 text-stone-900 font-black py-2.5 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2.5 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Sign in with Google (Super Admin)</span>
            </button>
          </div>

          <div className="relative flex items-center justify-center my-4">
            <div className="border-t border-stone-800 w-full" />
            <span className="bg-stone-900/60 px-3 text-[10px] font-bold text-stone-500 uppercase tracking-wider absolute">
              OR EMAIL PASSWORD
            </span>
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-300 mb-1.5 uppercase tracking-wider">
                Super Admin Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="ceo.mrfutkar@gmail.com"
                  autoComplete="email"
                  disabled={isLoading || isContextLoading}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white font-medium placeholder-stone-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-300 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter administrator password"
                  autoComplete="current-password"
                  disabled={isLoading || isContextLoading}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white font-medium placeholder-stone-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="p-3 bg-stone-950/70 border border-stone-800/80 rounded-xl flex items-center gap-2.5 text-[11px] text-stone-400">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Production Security: Authenticates via Firebase ID Token &bull; No bare UID fallback</span>
            </div>

            <button
              type="submit"
              disabled={isLoading || isContextLoading || !email.trim() || !password}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {isLoading || isContextLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Authorization...</span>
                </>
              ) : (
                <span>Sign In as Super Admin</span>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Security Footer */}
      <div className="p-4 text-center border-t border-stone-800/60 bg-stone-900/20 text-stone-500 text-xs">
        <p>MR FUTKAR Platform Security Governance &bull; Strict Role-Based Access Control</p>
      </div>
    </div>
  );
};
