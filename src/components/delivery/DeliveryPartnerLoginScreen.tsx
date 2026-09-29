import React, { useState } from 'react';
import { AuthService } from '../../services/authService';
import { DeliveryClient } from '../../services/deliveryClient';
import { DeliveryPartnerSession } from '../../types/delivery';
import BrandLogo from '../BrandLogo';
import {
  Truck,
  Building2,
  Lock,
  ArrowLeft,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Phone,
  ShieldCheck,
} from 'lucide-react';

interface DeliveryPartnerLoginScreenProps {
  onLoginSuccess: (session: DeliveryPartnerSession) => void;
  onCancel?: () => void;
}

export const DeliveryPartnerLoginScreen: React.FC<DeliveryPartnerLoginScreenProps> = ({
  onLoginSuccess,
  onCancel,
}) => {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [partnerId, setPartnerId] = useState('DP-DELHI-01');
  const [authMode, setAuthMode] = useState<'PARTNER_ID' | 'PHONE'>('PARTNER_ID');
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
      const res = await AuthService.sendOtp(phone, 'delivery-recaptcha-container');
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

  // Verify OTP & Resolve Server-Authoritative Delivery Session
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
      DeliveryClient.setAuthToken(token);

      // Authoritative session check
      const session = await DeliveryClient.getSession();

      if (session.role !== 'DELIVERY_PARTNER') {
        setErrorMessage('Delivery Partner access is not authorized for this account.');
        DeliveryClient.clearSession();
        return;
      }

      onLoginSuccess(session);
    } catch (err: any) {
      setErrorMessage('Delivery Partner access is not authorized for this account.');
      DeliveryClient.clearSession();
    } finally {
      setIsLoading(false);
    }
  };

  // Google Fleet Partner Authentication with Authoritative Firebase ID token
  const handleGooglePartnerLogin = async (targetPartnerId?: string) => {
    const idToUse = targetPartnerId || partnerId.trim() || 'DP-DELHI-01';
    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const fbUser = await AuthService.signInWithGoogle();
      const token = await fbUser.getIdToken();

      // Server-authoritative claim and session resolution via verified Firebase ID Token
      const session = await DeliveryClient.claimPartner(idToUse, token);

      if (session.role !== 'DELIVERY_PARTNER') {
        setErrorMessage('Delivery Partner access is not authorized for this account.');
        DeliveryClient.clearSession();
        return;
      }

      onLoginSuccess(session);
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        const msg = err.message || '';
        setErrorMessage(msg || 'Authentication failed. Please check credentials or contact hub administration.');
      }
      DeliveryClient.clearSession();
    } finally {
      setIsLoading(false);
    }
  };

  // Partner ID authentication via server session endpoint
  const handlePartnerIdLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerId.trim()) {
      setErrorMessage('Please enter your Delivery Partner ID.');
      return;
    }
    await handleGooglePartnerLogin(partnerId.trim());
  };

  return (
    <div className="min-h-screen bg-[#0d1d25] text-stone-100 flex flex-col justify-center items-center px-4 py-8">
      <div id="delivery-recaptcha-container"></div>

      <div className="max-w-md w-full space-y-6">
        {/* Brand & Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-[#f5b024] text-[#0d1d25] flex items-center justify-center shadow-xl shadow-amber-500/10 border-2 border-amber-400">
              <Truck className="w-10 h-10 stroke-[2.2]" />
            </div>
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-800 border border-stone-700 text-[#f5b024] text-xs font-mono font-bold">
              <Building2 className="w-3.5 h-3.5" />
              <span>WH-BRAHMPURI-01</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white mt-2 uppercase">
              MR FUTKAR
            </h1>
            <h2 className="text-base font-bold text-[#f5b024] uppercase tracking-wider">
              DELIVERY PARTNER
            </h2>
            <p className="text-xs text-stone-400 mt-1">
              Field Operations & Consignment Fulfillment System
            </p>
          </div>
        </div>

        {/* Authentication Card */}
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-2xl space-y-5">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 p-1 bg-stone-950 rounded-xl border border-stone-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setAuthMode('PARTNER_ID');
                setErrorMessage(null);
                setInfoMessage(null);
              }}
              className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                authMode === 'PARTNER_ID'
                  ? 'bg-[#f5b024] text-[#0d1d25] shadow'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Partner ID</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('PHONE');
                setErrorMessage(null);
                setInfoMessage(null);
              }}
              className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                authMode === 'PHONE'
                  ? 'bg-[#f5b024] text-[#0d1d25] shadow'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Mobile OTP</span>
            </button>
          </div>

          {/* Feedback Messages */}
          {errorMessage && (
            <div className="p-3 bg-[#e72b2b]/15 border border-[#e72b2b]/30 rounded-xl text-[#e72b2b] text-xs flex items-start gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {infoMessage && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-start gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Mode 1: Partner ID Authentication */}
          {authMode === 'PARTNER_ID' && (
            <form onSubmit={handlePartnerIdLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                  Select Fleet Partner Slot
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2.5">
                  {[
                    { id: 'DP-DELHI-01', name: 'Mukesh Sharma', vehicle: 'Motorcycle' },
                    { id: 'DP-DELHI-02', name: 'Sunil Verma', vehicle: 'Motorcycle' },
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPartnerId(p.id)}
                      className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                        partnerId === p.id
                          ? 'border-[#f5b024] bg-amber-500/15 text-[#f5b024]'
                          : 'border-stone-800 bg-stone-950 text-stone-400 hover:border-stone-700'
                      }`}
                    >
                      <div className="text-xs font-bold text-white">{p.name}</div>
                      <div className="text-[10px] font-mono text-stone-400">{p.id} &bull; {p.vehicle}</div>
                    </button>
                  ))}
                </div>

                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                  Partner ID / Personnel Token
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-3 text-stone-500" />
                  <input
                    type="text"
                    value={partnerId}
                    onChange={e => setPartnerId(e.target.value)}
                    placeholder="e.g. DP-DELHI-01"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white font-mono placeholder:text-stone-600 focus:outline-none focus:border-[#f5b024]"
                    required
                  />
                </div>
                <p className="text-[11px] text-stone-500 mt-1">
                  Authorized WH-BRAHMPURI-01 fleet delivery personnel.
                </p>
              </div>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleGooglePartnerLogin(partnerId || 'DP-DELHI-01')}
                className="w-full bg-white hover:bg-stone-100 text-stone-900 font-black py-2.5 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2.5 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-60"
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
                    <span>Sign in with Google (Fleet Partner)</span>
                  </>
                )}
              </button>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-[#f5b024] hover:bg-amber-400 text-[#0d1d25] font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                <span>Authenticate Partner Session</span>
              </button>
            </form>
          )}

          {/* Mode 2: Registered Mobile Phone OTP Auth */}
          {authMode === 'PHONE' && (
            <div className="space-y-4">
              {!otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                      Registered Mobile Number
                    </label>
                    <div className="flex gap-2">
                      <span className="inline-flex items-center px-3 rounded-xl border border-stone-800 bg-stone-950 text-stone-400 text-sm font-mono">
                        +91
                      </span>
                      <input
                        type="tel"
                        maxLength={10}
                        value={phone}
                        onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                        placeholder="9810012345"
                        className="flex-1 bg-stone-950 border border-stone-800 rounded-xl px-3 py-2.5 text-sm text-white font-mono placeholder:text-stone-600 focus:outline-none focus:border-[#f5b024]"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 px-4 bg-[#f5b024] hover:bg-amber-400 text-[#0d1d25] font-black text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>Send OTP</span>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                      Enter 4-Digit Verification Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={otp}
                      onChange={e => setOtp(e.target.value.trim())}
                      placeholder="1234"
                      className="w-full text-center text-2xl font-mono tracking-widest bg-stone-950 border border-stone-800 rounded-xl py-2.5 text-white focus:outline-none focus:border-[#f5b024]"
                      autoFocus
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Verify & Authenticate</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setOtp('');
                    }}
                    className="w-full text-center text-xs text-stone-400 hover:text-white"
                  >
                    Change mobile number
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Cancellation / Return to Main App */}
          {onCancel && (
            <div className="pt-2 border-t border-stone-800 text-center">
              <button
                type="button"
                onClick={onCancel}
                className="text-xs text-stone-400 hover:text-white font-medium inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to MR FUTKAR Retailer App</span>
              </button>
            </div>
          )}
        </div>

        {/* Security / Boundary Disclaimer */}
        <div className="text-center text-[11px] text-stone-500 space-y-1">
          <p>MR FUTKAR Delivery Operations • Brahmpuri Central Hub</p>
          <p>Unauthorized access strictly monitored under IT Act 2000.</p>
        </div>
      </div>
    </div>
  );
};
