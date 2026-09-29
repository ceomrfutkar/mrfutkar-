import React, { useState } from 'react';
import { AuthService } from '../../services/authService';
import { WarehouseClient } from '../../services/warehouseClient';
import { WarehouseSession } from '../../types/warehouse';
import BrandLogo from '../BrandLogo';
import {
  ShieldAlert,
  ShieldCheck,
  Building2,
  Lock,
  ArrowLeft,
  KeyRound,
  CheckCircle2,
  AlertOctagon,
  Loader2,
  UserCheck,
} from 'lucide-react';

interface WarehouseLoginScreenProps {
  onLoginSuccess: (session: WarehouseSession) => void;
  onCancel: () => void;
}

export const WarehouseLoginScreen: React.FC<WarehouseLoginScreenProps> = ({
  onLoginSuccess,
  onCancel,
}) => {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [staffId, setStaffId] = useState('');
  const [authMode, setAuthMode] = useState<'STAFF_ID' | 'PHONE'>('STAFF_ID');
  const [otpSent, setOtpSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Send OTP via existing Firebase Phone Auth
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 10) {
      setErrorMessage('Please enter a valid 10-digit registered mobile number.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const res = await AuthService.sendOtp(phone, 'warehouse-recaptcha-container');
      setOtpSent(true);
      if (res.isTestMode) {
        setInfoMessage(res.message || 'Test code mode active. Enter 1234.');
      } else {
        setInfoMessage(`Verification OTP sent to +91 ${phone}`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to send OTP. Please check mobile number.');
    } finally {
      setIsLoading(false);
    }
  };

  // Verify OTP & Resolve Server-Authoritative Warehouse Session
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 4) {
      setErrorMessage('Please enter the 4-digit verification code.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const fbUser = await AuthService.verifyOtp(otp, phone);
      const token = await fbUser.getIdToken();

      // Server-authoritative session resolution
      const session = await WarehouseClient.getSession(token);

      if (session.role === ('RETAILER' as any)) {
        setErrorMessage('Warehouse access is not authorized for this account.');
        WarehouseClient.clearSession();
        return;
      }

      onLoginSuccess(session);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.toLowerCase().includes('retailer') || msg.toLowerCase().includes('not permitted')) {
        setErrorMessage('Warehouse access is not authorized for this account.');
      } else {
        setErrorMessage('Access denied. Please check your credentials or contact hub administration.');
      }
      WarehouseClient.clearSession();
    } finally {
      setIsLoading(false);
    }
  };

  // Google Staff Authentication with Authoritative Firebase ID token
  const handleGoogleStaffLogin = async (targetId?: string) => {
    const idToUse = targetId || staffId.trim() || 'WH-ADMIN-01';
    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const fbUser = await AuthService.signInWithGoogle();
      const token = await fbUser.getIdToken();

      // Server-authoritative claim and session resolution via verified Firebase ID Token
      const session = await WarehouseClient.claimStaff(idToUse, token);

      if (session.role === ('RETAILER' as any)) {
        setErrorMessage('Warehouse access is not authorized for this account.');
        WarehouseClient.clearSession();
        return;
      }

      onLoginSuccess(session);
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        const msg = err.message || '';
        if (msg.toLowerCase().includes('retailer') || msg.toLowerCase().includes('not permitted')) {
          setErrorMessage('Warehouse access is not authorized for this account.');
        } else {
          setErrorMessage(msg || 'Authentication failed. Please check credentials or contact hub administration.');
        }
      }
      WarehouseClient.clearSession();
    } finally {
      setIsLoading(false);
    }
  };

  // Direct Staff Credential Authentication via server session validation
  const handleStaffIdLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffId.trim()) {
      setErrorMessage('Please enter your Warehouse Staff Personnel ID.');
      return;
    }
    await handleGoogleStaffLogin(staffId.trim());
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col justify-center items-center px-4 py-8">
      <div id="warehouse-recaptcha-container"></div>

      <div className="max-w-md w-full space-y-6">
        {/* Brand & Hub Banner */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="p-3 bg-stone-900 border border-stone-800 rounded-2xl shadow-xl">
              <BrandLogo variant="compact" showCorporate={false} />
            </div>
          </div>

          <div className="pt-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold">
              <Building2 className="w-3.5 h-3.5" />
              <span>WH-BRAHMPURI-01</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white mt-2">
              MR FUTKAR — BRAHMPURI
            </h1>
            <p className="text-xs text-stone-400">
              Brahmpuri Branch • Central Hub Fulfillment Operations Gate
            </p>
          </div>
        </div>

        {/* Security Warning Notice */}
        <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-stone-800 text-xs">
            <span className="font-bold text-stone-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-500" />
              Staff Authentication Gate
            </span>
            <span className="text-[10px] text-amber-400 font-mono font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              STRICT RBAC
            </span>
          </div>

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 bg-stone-950 p-1 rounded-xl border border-stone-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setAuthMode('STAFF_ID');
                setErrorMessage(null);
              }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                authMode === 'STAFF_ID'
                  ? 'bg-amber-500 text-stone-950 shadow-sm'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              Hub Personnel ID
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('PHONE');
                setErrorMessage(null);
              }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                authMode === 'PHONE'
                  ? 'bg-amber-500 text-stone-950 shadow-sm'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              Registered Mobile OTP
            </button>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-200 text-xs rounded-xl flex items-start gap-2.5">
              <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          {/* Info Message */}
          {infoMessage && (
            <div className="p-3 bg-amber-950/60 border border-amber-800/80 text-amber-200 text-xs rounded-xl flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span className="font-medium">{infoMessage}</span>
            </div>
          )}

          {/* Mode 1: Staff Personnel ID Authentication */}
          {authMode === 'STAFF_ID' && (
            <form onSubmit={handleStaffIdLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-1.5">
                  Select Staff Role / Personnel Slot
                </label>
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  {[
                    { id: 'WH-ADMIN-01', label: 'Hub Admin', title: 'Akash Gupta' },
                    { id: 'WH-MGR-01', label: 'Manager', title: 'Rahul Verma' },
                    { id: 'WH-STAFF-01', label: 'Staff', title: 'Sonu Kumar' },
                  ].map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStaffId(s.id)}
                      className={`p-2 rounded-lg text-left border transition-all cursor-pointer ${
                        staffId === s.id
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                          : 'border-stone-800 bg-stone-900 text-stone-400 hover:border-stone-700'
                      }`}
                    >
                      <div className="text-[11px] font-bold">{s.label}</div>
                      <div className="text-[9px] font-mono text-stone-500">{s.id}</div>
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <UserCheck className="w-4 h-4 absolute left-3.5 top-3.5 text-stone-500" />
                  <input
                    type="text"
                    value={staffId}
                    onChange={e => setStaffId(e.target.value)}
                    placeholder="e.g. WH-ADMIN-01, WH-MGR-01, WH-STAFF-01"
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white font-mono placeholder:text-stone-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    required
                  />
                </div>
                <p className="text-[11px] text-stone-500 mt-1">
                  Assigned authorized identifier for WH-BRAHMPURI-01 warehouse personnel.
                </p>
              </div>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleGoogleStaffLogin(staffId || 'WH-ADMIN-01')}
                className="w-full bg-white hover:bg-stone-100 text-stone-900 font-black py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2.5 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-stone-900" />
                    <span>Verifying Authority...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Sign in with Google (Hub Staff)</span>
                  </>
                )}
              </button>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-2 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-60"
              >
                <KeyRound className="w-4 h-4" />
                <span>Authenticate Staff Session</span>
              </button>
            </form>
          )}

          {/* Mode 2: Firebase Phone OTP Authentication */}
          {authMode === 'PHONE' && (
            <div className="space-y-4">
              {!otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-1.5">
                      Registered Staff Mobile Number
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs font-bold text-stone-500">+91</span>
                      <input
                        type="tel"
                        maxLength={10}
                        value={phone}
                        onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                        placeholder="Enter 10-digit mobile number"
                        className="w-full bg-stone-950 border border-stone-700 rounded-xl pl-11 pr-4 py-2.5 text-sm text-white font-bold placeholder:text-stone-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-60"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sending Code...</span>
                      </>
                    ) : (
                      <span>Request Security OTP</span>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-1.5">
                      Enter 4-Digit Security OTP
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 1234"
                      className="w-full bg-stone-950 border border-stone-700 rounded-xl px-4 py-2.5 text-center text-lg tracking-widest font-mono text-white font-bold placeholder:text-stone-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      required
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setOtpSent(false)}
                      className="flex-1 bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer"
                    >
                      Change Phone
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-60"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <span>Verify & Enter</span>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Cancel & Return to Retailer App */}
          <div className="pt-3 border-t border-stone-800/80 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={onCancel}
              className="text-stone-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Retailer Kirana App</span>
            </button>
            <span className="text-[10px] text-stone-600">WH-BRAHMPURI-01 Central Hub</span>
          </div>
        </div>
      </div>
    </div>
  );
};
