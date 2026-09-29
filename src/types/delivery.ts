export type DeliveryPartnerRole = 'DELIVERY_PARTNER';

export type DeliveryAvailabilityStatus = 'OFFLINE' | 'AVAILABLE' | 'ON_DELIVERY' | 'PAUSED';

export type DeliveryAccountStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type DeliveryAssignmentStatus =
  | 'UNASSIGNED'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'PICKED_UP'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED_DELIVERY'
  | 'RETURN_TO_WAREHOUSE';

export type DeliveryRejectionReason =
  | 'CUSTOMER_TOO_FAR'
  | 'VEHICLE_ISSUE'
  | 'PERSONAL_REASON'
  | 'ROUTE_ISSUE'
  | 'OTHER';

export type DeliveryFailureReason =
  | 'CUSTOMER_UNAVAILABLE'
  | 'WRONG_ADDRESS'
  | 'CUSTOMER_REFUSED'
  | 'SHOP_CLOSED'
  | 'PAYMENT_ISSUE'
  | 'VEHICLE_ISSUE'
  | 'OTHER';

export type DeliveryPaymentMethod = 'COD' | 'UPI' | 'ONLINE' | 'CREDIT';

export type DeliveryPaymentCollectionStatus =
  | 'NOT_REQUIRED'
  | 'PENDING'
  | 'COLLECTED'
  | 'PARTIALLY_COLLECTED'
  | 'FAILED'
  | 'RECONCILIATION_PENDING'
  | 'RECONCILED';

export interface DeliveryPartner {
  partnerId: string;
  userId: string;
  name: string;
  mobile: string;
  alternateMobile?: string;
  photoUrl?: string;
  status: DeliveryAccountStatus;
  availabilityStatus: DeliveryAvailabilityStatus;
  vehicleType: string; // e.g. 'MOTORCYCLE', 'TATA_ACE', 'E_RICKSHAW', 'TEMPO'
  vehicleNumber: string;
  licenseNumber: string;
  assignedWarehouseId: 'WH-BRAHMPURI-01';
  assignedWarehouseName: 'MR FUTKAR — BRAHMPURI';
  serviceAreas: string[];
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
}

export interface DeliveryPartnerSession {
  userId: string;
  partnerId: string;
  role: 'DELIVERY_PARTNER';
  warehouseId: 'WH-BRAHMPURI-01';
  warehouseName: 'MR FUTKAR — BRAHMPURI';
  partnerName: string;
  mobile: string;
  availabilityStatus: DeliveryAvailabilityStatus;
  accountStatus: DeliveryAccountStatus;
}

export interface ProofOfDelivery {
  podId?: string;
  recipientName: string;
  otpVerified: boolean;
  otpVerifiedAt: string | null;
  photoUrl: string | null;
  signatureUrl: string | null;
  completedAt: string | null;
  completedBy: string | null;
}

export interface DeliveryOtp {
  status: 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'BLOCKED';
  createdAt: string;
  expiresAt: string;
  attemptCount: number;
  verifiedAt?: string | null;
  otpHash?: string;
}

export interface DeliveryCompletionRecord {
  recipientName: string;
  recipientCapturedAt: string;
  otpVerifiedAt: string;
  podId?: string;
  podPhotoPath?: string | null;
  signaturePath?: string | null;
  codExpectedAmount: number;
  codCollectedAmount: number;
  codPaymentStatus: 'NOT_REQUIRED' | 'COLLECTED' | 'PENDING';
  completedAt: string;
  completedBy: string;
}

export interface DeliveryOrderSnapshot {
  assignmentStatus: DeliveryAssignmentStatus;
  assignedPartnerId?: string;
  assignedPartnerName?: string;
  assignedPartnerMobile?: string;
  assignedAt?: string;
  assignedBy?: string;
  acceptedAt?: string;
  rejectionReason?: string;
  rejectedAt?: string;
  pickedUpAt?: string;
  pickedUpBy?: string;
  outForDeliveryAt?: string;
  deliveredAt?: string;
  deliveredBy?: string;
  recipientName?: string;
  recipientCapturedAt?: string;
  deliveryNotes?: string;
  proofOfDeliveryRef?: string;
  failedAt?: string;
  failureReason?: DeliveryFailureReason | string;
  returnedAt?: string;
  returnReason?: string;
  warehouseId: 'WH-BRAHMPURI-01';

  // Proof of Delivery & OTP
  proofOfDelivery?: ProofOfDelivery;
  deliveryOtp?: string | DeliveryOtp;
  deliveryOtpHash?: string;
  otpGeneratedAt?: string;
  otpExpiresAt?: string;
  otpAttempts?: number;
  otpVerified?: boolean;
  otpVerifiedAt?: string;
}

export interface DeliveryPaymentSnapshot {
  method: DeliveryPaymentMethod;
  amountDue: number;
  amountCollected: number;
  collectionStatus: DeliveryPaymentCollectionStatus;
  collectedAt?: string;
  collectedBy?: string;
  referenceId?: string;
  codCollectionId?: string;
  notes?: string;
}

// Phase 6 Part 4A: Delivery COD Collection & Cash Custody Types
export type CODCollectionStatus = 'PENDING' | 'COLLECTED' | 'CANCELLED';
export type CODPaymentMethod = 'CASH' | 'UPI';

export interface CODCollectionRecord {
  collectionId: string;
  orderId: string;
  orderNumber?: string;
  retailerId: string;
  deliveryPartnerId: string;
  warehouseId: 'WH-BRAHMPURI-01';
  paymentMethod: CODPaymentMethod;
  amountDuePaise: number;
  amountCollectedPaise: number;
  currency: 'INR';
  collectionStatus: CODCollectionStatus;
  collectedAt: string;
  collectedBy: string;
  referenceId?: string | null;
  customerReceiptId?: string | null;
  customerReceiptNumber?: string | null;
  createdAt: string;
  updatedAt: string;
  _serverTxnToken?: string;
  _serverWriteNonce?: string;
}

export interface DeliveryPartnerCustody {
  partnerId: string;
  warehouseId: 'WH-BRAHMPURI-01';
  cashBalancePaise: number;
  updatedAt: string;
  _serverTxnToken?: string;
  _serverWriteNonce?: string;
}

export type DeliveryCustodyMovementType =
  | 'COD_COLLECTION_CASH'
  | 'COD_HANDOVER_OUT'
  | 'COD_HANDOVER_IN';

export interface DeliveryCustodyMovement {
  movementId: string;
  partnerId?: string;
  warehouseId: 'WH-BRAHMPURI-01';
  orderId?: string;
  collectionId?: string;
  handoverId?: string;
  destinationType?: CODHandoverDestinationType;
  destinationId?: string;
  sourceId?: string;
  movementType: DeliveryCustodyMovementType;
  amountPaise: number;
  balanceAfterPaise: number;
  timestamp: string;
  referenceId?: string | null;
  createdBy: string;
  _serverTxnToken?: string;
  _serverWriteNonce?: string;
}

// Phase 6 Part 4B: Delivery COD Handover & Custody Transfer Types
export type CODHandoverDestinationType = 'WAREHOUSE' | 'ADMIN';
export type CODHandoverStatus = 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export interface CODHandoverRecord {
  handoverId: string;
  deliveryPartnerId: string;
  deliveryPartnerName?: string;
  warehouseId: 'WH-BRAHMPURI-01';
  destinationType: CODHandoverDestinationType;
  destinationId?: string;
  status: CODHandoverStatus;
  requestedAmountPaise: number;
  acceptedAmountPaise: number | null;
  discrepancyAmountPaise: number | null;
  collectionIds: string[];
  orderIds: string[];
  submittedAt: string;
  submittedBy: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  _serverTxnToken?: string;
  _serverWriteNonce?: string;
}

export interface WarehouseCashCustody {
  warehouseId: 'WH-BRAHMPURI-01';
  cashBalancePaise: number;
  updatedAt: string;
  _serverTxnToken?: string;
  _serverWriteNonce?: string;
}

export interface AdminCashCustody {
  adminId: string;
  cashBalancePaise: number;
  updatedAt: string;
  _serverTxnToken?: string;
  _serverWriteNonce?: string;
}
