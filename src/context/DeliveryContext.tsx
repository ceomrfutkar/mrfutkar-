import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  DeliveryPartner,
  DeliveryPartnerSession,
  DeliveryAvailabilityStatus,
  DeliveryRejectionReason,
  DeliveryFailureReason,
} from '../types/delivery';
import { DeliveryClient } from '../services/deliveryClient';
import { auth } from '../config/firebase';

export type DeliveryTab = 'HOME' | 'DELIVERIES' | 'HISTORY' | 'PROFILE';
export type DeliveryView = 'HOME' | 'DELIVERIES' | 'ORDER_DETAIL' | 'HISTORY' | 'PROFILE';

interface DeliveryContextType {
  session: DeliveryPartnerSession | null;
  profile: DeliveryPartner | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  availabilityStatus: DeliveryAvailabilityStatus;
  currentTab: DeliveryTab;
  currentView: DeliveryView;
  orders: any[];
  selectedOrderId: string | null;
  selectedOrder: any | null;
  
  // Navigation
  setCurrentTab: (tab: DeliveryTab) => void;
  setCurrentView: (view: DeliveryView) => void;
  selectOrder: (orderId: string) => void;
  clearSelectedOrder: () => void;
  
  // Core Actions
  refreshSession: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  setAvailability: (status: DeliveryAvailabilityStatus) => Promise<boolean>;
  acceptOrder: (orderId: string) => Promise<boolean>;
  rejectOrder: (orderId: string, reason: DeliveryRejectionReason | string) => Promise<boolean>;
  pickupOrder: (orderId: string) => Promise<boolean>;
  startDelivery: (orderId: string) => Promise<boolean>;
  markDelivered: (
    orderId: string,
    details?: {
      recipientName?: string;
      deliveryNotes?: string;
      amountCollected?: number;
      paymentMethod?: 'CASH' | 'UPI';
      paymentReference?: string;
      otp?: string;
      photoUrl?: string;
      signatureUrl?: string;
    }
  ) => Promise<boolean>;
  failDelivery: (orderId: string, reason: DeliveryFailureReason | string, notes?: string) => Promise<boolean>;
  returnToWarehouse: (orderId: string, reason?: string) => Promise<boolean>;
  verifyOtp: (orderId: string, otp: string) => Promise<boolean>;
  uploadPod: (orderId: string, type: 'photo' | 'signature', dataUrl: string) => Promise<boolean>;
  updateProfile: (updates: { alternateMobile?: string }) => Promise<boolean>;
  loginWithSession: (session: DeliveryPartnerSession) => void;
  logout: () => Promise<void>;
  clearError: () => void;
}

const DeliveryContext = createContext<DeliveryContextType | undefined>(undefined);

export const DeliveryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<DeliveryPartnerSession | null>(DeliveryClient.getCurrentSession());
  const [profile, setProfile] = useState<DeliveryPartner | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [availabilityStatus, setAvailabilityStatus] = useState<DeliveryAvailabilityStatus>('OFFLINE');
  const [currentTab, setCurrentTabState] = useState<DeliveryTab>('HOME');
  const [currentView, setCurrentViewState] = useState<DeliveryView>('HOME');
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const setCurrentTab = useCallback((tab: DeliveryTab) => {
    setCurrentTabState(tab);
    setCurrentViewState(tab);
    setSelectedOrderId(null);
    clearError();
  }, [clearError]);

  const setCurrentView = useCallback((view: DeliveryView) => {
    setCurrentViewState(view);
    if (view === 'HOME' || view === 'DELIVERIES' || view === 'HISTORY' || view === 'PROFILE') {
      setCurrentTabState(view);
    }
    clearError();
  }, [clearError]);

  const selectOrder = useCallback((orderId: string) => {
    setSelectedOrderId(orderId);
    setCurrentViewState('ORDER_DETAIL');
    clearError();
  }, [clearError]);

  const clearSelectedOrder = useCallback(() => {
    setSelectedOrderId(null);
    setCurrentViewState(currentTab);
    clearError();
  }, [currentTab, clearError]);

  // Map server/network error to user-friendly message
  const mapErrorMessage = (err: any): string => {
    if (!navigator.onLine) {
      return 'Internet connection required to update delivery status.';
    }
    const msg: string = err.message || '';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('timeout')) {
      return 'Network communication error. Please verify connection and retry.';
    }
    if (msg.includes('UNAUTHORIZED') || msg.includes('401')) {
      return 'Your delivery session has expired. Please login again.';
    }
    if (msg.includes('FORBIDDEN') || msg.includes('403')) {
      return 'Delivery Partner access is not authorized for this account.';
    }
    if (msg.includes('ORDER_NOT_FOUND') || msg.includes('404')) {
      return 'Delivery order is no longer available or not assigned to you.';
    }
    if (msg.includes('ALREADY_ASSIGNED') || msg.includes('409') || msg.includes('CONFLICT')) {
      return 'This delivery has already been assigned or updated.';
    }
    if (msg.includes('INVALID_TRANSITION') || msg.includes('INVALID_STATUS')) {
      return 'This delivery order is in a state that cannot be transitioned.';
    }
    if (msg.includes('ACTIVE_TRIP_IN_PROGRESS') || msg.includes('CANNOT_GO_OFFLINE')) {
      return 'Cannot go offline while an active order or delivery trip is in progress.';
    }
    if (msg.includes('EXCEEDS_AMOUNT_DUE')) {
      return 'Amount collected cannot exceed total COD amount due.';
    }
    return msg || 'An unexpected delivery error occurred. Please try again.';
  };

  // Refresh Session
  const refreshSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const sess = await DeliveryClient.getSession();
      setSession(sess);
      setAvailabilityStatus(sess.availabilityStatus || 'OFFLINE');
      const prof = await DeliveryClient.getProfile().catch(() => null);
      if (prof) setProfile(prof);
    } catch (err: any) {
      setError(mapErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh Orders
  const refreshOrders = useCallback(async () => {
    if (!DeliveryClient.isAuthorized()) return;
    try {
      const list = await DeliveryClient.getAssignedOrders();
      setOrders(list);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('401') || msg.includes('403') || msg.includes('UNAUTHORIZED') || msg.includes('expired')) {
        DeliveryClient.clearSession();
        setSession(null);
      }
      console.warn('Note fetching assigned orders:', err.message || err);
    }
  }, []);

  // Set Availability
  const setAvailability = useCallback(async (status: DeliveryAvailabilityStatus): Promise<boolean> => {
    if (!navigator.onLine) {
      setError('Internet connection required to update delivery status.');
      return false;
    }
    if (isSubmitting) return false;
    try {
      setIsSubmitting(true);
      setError(null);
      await DeliveryClient.setAvailability(status);
      setAvailabilityStatus(status);
      if (session) {
        setSession({ ...session, availabilityStatus: status });
      }
      return true;
    } catch (err: any) {
      setError(mapErrorMessage(err));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, session]);

  // Accept Order
  const acceptOrder = useCallback(async (orderId: string): Promise<boolean> => {
    if (!navigator.onLine) {
      setError('Internet connection required to update delivery status.');
      return false;
    }
    if (isSubmitting) return false;
    try {
      setIsSubmitting(true);
      setError(null);
      await DeliveryClient.acceptOrder(orderId);
      await refreshOrders();
      return true;
    } catch (err: any) {
      setError(mapErrorMessage(err));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, refreshOrders]);

  // Reject Order
  const rejectOrder = useCallback(async (orderId: string, reason: DeliveryRejectionReason | string): Promise<boolean> => {
    if (!navigator.onLine) {
      setError('Internet connection required to update delivery status.');
      return false;
    }
    if (isSubmitting) return false;
    try {
      setIsSubmitting(true);
      setError(null);
      await DeliveryClient.rejectOrder(orderId, reason);
      await refreshOrders();
      setSelectedOrderId(null);
      setCurrentViewState('DELIVERIES');
      return true;
    } catch (err: any) {
      setError(mapErrorMessage(err));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, refreshOrders]);

  // Pickup Order
  const pickupOrder = useCallback(async (orderId: string): Promise<boolean> => {
    if (!navigator.onLine) {
      setError('Internet connection required to update delivery status.');
      return false;
    }
    if (isSubmitting) return false;
    try {
      setIsSubmitting(true);
      setError(null);
      await DeliveryClient.pickupOrder(orderId);
      await refreshOrders();
      return true;
    } catch (err: any) {
      setError(mapErrorMessage(err));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, refreshOrders]);

  // Start Delivery
  const startDelivery = useCallback(async (orderId: string): Promise<boolean> => {
    if (!navigator.onLine) {
      setError('Internet connection required to update delivery status.');
      return false;
    }
    if (isSubmitting) return false;
    try {
      setIsSubmitting(true);
      setError(null);
      await DeliveryClient.setOutForDelivery(orderId);
      setAvailabilityStatus('ON_DELIVERY');
      await refreshOrders();
      return true;
    } catch (err: any) {
      setError(mapErrorMessage(err));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, refreshOrders]);

  // Mark Delivered
  const markDelivered = useCallback(async (
    orderId: string,
    details?: {
      recipientName?: string;
      deliveryNotes?: string;
      amountCollected?: number;
      paymentMethod?: 'CASH' | 'UPI';
      paymentReference?: string;
      otp?: string;
      photoUrl?: string;
      signatureUrl?: string;
    }
  ): Promise<boolean> => {
    if (!navigator.onLine) {
      setError('Internet connection required to update delivery status.');
      return false;
    }
    if (isSubmitting) return false;
    try {
      setIsSubmitting(true);
      setError(null);
      await DeliveryClient.completeDelivery(orderId, details);
      await refreshOrders();
      // Check if other deliveries are in flight to determine availability status
      const remainingActive = orders.filter(
        o => o.orderId !== orderId &&
        (o.delivery?.assignmentStatus === 'PICKED_UP' || o.delivery?.assignmentStatus === 'OUT_FOR_DELIVERY')
      );
      if (remainingActive.length === 0) {
        setAvailabilityStatus('AVAILABLE');
      }
      return true;
    } catch (err: any) {
      setError(mapErrorMessage(err));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, refreshOrders, orders]);

  // Fail Delivery
  const failDelivery = useCallback(async (
    orderId: string,
    reason: DeliveryFailureReason | string,
    notes?: string
  ): Promise<boolean> => {
    if (!navigator.onLine) {
      setError('Internet connection required to update delivery status.');
      return false;
    }
    if (isSubmitting) return false;
    try {
      setIsSubmitting(true);
      setError(null);
      await DeliveryClient.failDelivery(orderId, reason, notes);
      await refreshOrders();
      return true;
    } catch (err: any) {
      setError(mapErrorMessage(err));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, refreshOrders]);

  // Return to Warehouse
  const returnToWarehouse = useCallback(async (orderId: string, reason?: string): Promise<boolean> => {
    if (!navigator.onLine) {
      setError('Internet connection required to update delivery status.');
      return false;
    }
    if (isSubmitting) return false;
    try {
      setIsSubmitting(true);
      setError(null);
      await DeliveryClient.returnToWarehouse(orderId, reason);
      await refreshOrders();
      return true;
    } catch (err: any) {
      setError(mapErrorMessage(err));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, refreshOrders]);

  // Delivery OTP Verification Action
  const verifyOtp = useCallback(async (orderId: string, otp: string): Promise<boolean> => {
    if (isSubmitting) return false;
    try {
      setIsSubmitting(true);
      setError(null);
      await DeliveryClient.verifyDeliveryOtp(orderId, otp);
      await refreshOrders();
      return true;
    } catch (err: any) {
      setError(mapErrorMessage(err));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, refreshOrders]);

  // Proof of Delivery Media Upload
  const uploadPod = useCallback(async (orderId: string, type: 'photo' | 'signature', dataUrl: string): Promise<boolean> => {
    try {
      await DeliveryClient.uploadPod(orderId, type, dataUrl);
      await refreshOrders();
      return true;
    } catch (err: any) {
      setError(mapErrorMessage(err));
      return false;
    }
  }, [refreshOrders]);

  // Update Profile
  const updateProfile = useCallback(async (updates: { alternateMobile?: string }): Promise<boolean> => {
    if (!navigator.onLine) {
      setError('Internet connection required to update profile.');
      return false;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      const updated = await DeliveryClient.updateProfile(updates);
      setProfile(updated);
      return true;
    } catch (err: any) {
      setError(mapErrorMessage(err));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  // Login with Session
  const loginWithSession = useCallback((newSession: DeliveryPartnerSession) => {
    DeliveryClient.setCurrentSession(newSession);
    setSession(newSession);
    setAvailabilityStatus(newSession.availabilityStatus || 'OFFLINE');
    DeliveryClient.getProfile().then(p => setProfile(p)).catch(() => {});
    DeliveryClient.getAssignedOrders().then(o => setOrders(o)).catch(() => {});
  }, []);

  // Logout
  const logout = useCallback(async () => {
    try {
      await auth.signOut();
    } catch (e) {
      // ignore
    }
    DeliveryClient.clearSession();
    setSession(null);
    setProfile(null);
    setOrders([]);
    setSelectedOrderId(null);
    setAvailabilityStatus('OFFLINE');
    setCurrentTabState('HOME');
    setCurrentViewState('HOME');
    setError(null);
  }, []);

  // Polling / Periodic order refresh when active
  useEffect(() => {
    if (!session) return;
    refreshOrders();
    const interval = setInterval(() => {
      refreshOrders();
    }, 15000);
    return () => clearInterval(interval);
  }, [session, refreshOrders]);

  const selectedOrder = orders.find(o => o.orderId === selectedOrderId) || null;
  const isAuthenticated = DeliveryClient.isAuthorized();

  return (
    <DeliveryContext.Provider
      value={{
        session,
        profile,
        isAuthenticated,
        isLoading,
        isSubmitting,
        error,
        availabilityStatus,
        currentTab,
        currentView,
        orders,
        selectedOrderId,
        selectedOrder,
        setCurrentTab,
        setCurrentView,
        selectOrder,
        clearSelectedOrder,
        refreshSession,
        refreshOrders,
        setAvailability,
        acceptOrder,
        rejectOrder,
        pickupOrder,
        startDelivery,
        markDelivered,
        failDelivery,
        returnToWarehouse,
        verifyOtp,
        uploadPod,
        updateProfile,
        loginWithSession,
        logout,
        clearError,
      }}
    >
      {children}
    </DeliveryContext.Provider>
  );
};

export const useDelivery = () => {
  const ctx = useContext(DeliveryContext);
  if (!ctx) {
    throw new Error('useDelivery must be used within a DeliveryProvider');
  }
  return ctx;
};
