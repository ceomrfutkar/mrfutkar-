import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ShieldCheck, Phone, ArrowRight, Store, CheckCircle2, RotateCcw, Loader2 } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { MR_THEME } from '../theme/theme';
import { AuthService } from '../services/authService';

export default function LoginScreen() {
  const { navigate, replace, switchTab, login, profile } = useApp();
  const [phone, setPhone] = useState('9829012345');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('1234');
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleContinue = async () => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length !== 10) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }
    setError('');
    setIsSubmitting(true);

    try {
      const res = await AuthService.sendOtp(cleaned);
      if (res.isTestMode && res.message) {
        setInfoMessage(res.message);
      } else {
        setInfoMessage('');
      }
      setOtpSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 4) {
      setError('Please enter 4 or 6 digit verification code');
      return;
    }
    setError('');
    setIsSubmitting(true);

    try {
      const user = await AuthService.verifyOtp(otp, phone);
      await login(phone, user.uid);

      // If profile is incomplete -> Registration / Setup, else -> Home
      const isComplete = profile.isProfileComplete && profile.shopName && profile.ownerName;
      if (isComplete) {
        replace('Main');
        switchTab('Home');
      } else {
        replace('ShopSetup');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid verification code. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const user = await AuthService.signInWithGoogle();
      const phoneNum = user.phoneNumber?.replace('+91', '') || '9829012345';
      await login(phoneNum, user.uid);
      const isComplete = profile.isProfileComplete && profile.shopName && profile.ownerName;
      if (isComplete) {
        replace('Main');
        switchTab('Home');
      } else {
        replace('ShopSetup');
      }
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setError(err.message || 'Google sign-in failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickDemoNewUser = async () => {
    // New Kirana Store Registration uses Google Authentication
    await handleGoogleSignIn();
  };

  return (
    <div className="min-h-[85vh] flex flex-col justify-center px-4 sm:px-6 py-6 max-w-md mx-auto w-full">
      {/* Company Official Logo Banner */}
      <div className="mb-5">
        <BrandLogo variant="card" showTagline={true} showCorporate={true} />
      </div>

      <div className="bg-white rounded-3xl border border-stone-200/90 p-6 shadow-sm">
        <div className="mb-4">
          <span className="text-[11px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-md uppercase tracking-wider">
            Retailer Portal
          </span>
          <h2 className="text-xl font-black text-stone-900 mt-2">
            {otpSent ? 'Enter OTP Verification' : 'Kirana Retailer Login'}
          </h2>
          <p className="text-xs text-stone-500 mt-1">
            {otpSent
              ? `We have sent a 4-digit verification code to +91 ${phone}`
              : 'Direct wholesale rates, credit support & doorstep FMCG delivery.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200">
            {error}
          </div>
        )}

        {infoMessage && (
          <div className="mb-4 p-3 bg-amber-50 text-amber-800 text-xs font-semibold rounded-xl border border-amber-200">
            {infoMessage}
          </div>
        )}

        <div id="recaptcha-container"></div>

        {!otpSent ? (
          <div className="space-y-4">
            {/* Primary Production Google Sign-in */}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleGoogleSignIn}
              className="w-full bg-white hover:bg-stone-50 text-stone-800 font-bold text-sm py-3.5 px-4 rounded-xl border border-stone-300 transition-all shadow-sm flex items-center justify-center gap-2.5 active:scale-98 cursor-pointer disabled:opacity-75"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Sign in with Google</span>
            </button>

            <div className="relative flex items-center justify-center my-2">
              <div className="border-t border-stone-200 w-full" />
              <span className="bg-white px-3 text-[10px] font-bold text-stone-400 uppercase tracking-wider absolute">OR MOBILE NUMBER</span>
            </div>

            <div>
              <label className="block text-xs font-black text-stone-700 mb-1.5 uppercase tracking-wider">
                Mobile Number
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-sm font-bold text-stone-500">
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 10-digit mobile number"
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl pl-12 pr-4 py-3 text-base font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#0d1d25] focus:bg-white transition-all"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleContinue}
              className="w-full bg-[#0d1d25] hover:bg-[#071319] text-white font-black text-sm py-3 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 active:scale-98 cursor-pointer disabled:opacity-75"
            >
              <span>{isSubmitting ? 'SENDING OTP...' : 'CONTINUE WITH MOBILE'}</span>
              <ArrowRight className="w-4 h-4 text-amber-400" />
            </button>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleQuickDemoNewUser}
                className="w-full text-center text-xs font-bold text-amber-700 hover:text-amber-800 py-1"
              >
                + Register New Kirana Store (Create Account)
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-black text-stone-700 uppercase tracking-wider">
                  Verification Code
                </label>
                <button
                  type="button"
                  onClick={() => setOtpSent(false)}
                  className="text-xs text-amber-700 font-bold hover:underline"
                >
                  Change Number
                </button>
              </div>
              <input
                type="text"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value)}
                placeholder="1234"
                className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.3em] font-mono font-black text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#0d1d25] focus:bg-white"
              />
              <div className="flex items-center justify-between mt-2 text-[11px] text-stone-500">
                <span>Demo OTP: <strong className="text-stone-900 font-mono">1234</strong></span>
                <button
                  type="button"
                  onClick={() => setOtp('1234')}
                  className="text-amber-700 font-bold hover:underline flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Resend OTP
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleVerifyOtp}
              className="w-full bg-[#0d1d25] hover:bg-[#071319] text-white font-black text-sm py-3.5 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 active:scale-98 disabled:opacity-75"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>VERIFYING...</span>
                </>
              ) : (
                <>
                  <span>VERIFY & CONTINUE</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </>
              )}
            </button>
          </div>
        )}

        <div className="mt-6 pt-5 border-t border-stone-100 flex items-start gap-2.5 text-stone-500 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Authorized Kirana procurement under <strong className="text-stone-700">{MR_THEME.brand.companyName}</strong>. Safe & encrypted.
          </p>
        </div>

        <div className="mt-3 pt-2 text-center space-y-1">
          <div>
            <button
              type="button"
              onClick={() => navigate('Warehouse')}
              className="text-[11px] font-medium text-stone-400 hover:text-stone-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Hub Staff? Access WH-BRAHMPURI-01 Operations</span>
            </button>
          </div>
          <div>
            <button
              type="button"
              onClick={() => navigate('DeliveryPartner')}
              className="text-[11px] font-medium text-stone-400 hover:text-stone-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Delivery Fleet? Access Delivery Partner App</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
