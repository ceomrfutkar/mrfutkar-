import React from 'react';
import { OrderStatus } from '../types/order';
import {
  Clock,
  CheckCircle2,
  Package,
  Truck,
  AlertCircle,
  Boxes,
  Send,
  XCircle,
} from 'lucide-react';

interface OrderStatusBadgeProps {
  status: OrderStatus | string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export default function OrderStatusBadge({
  status,
  size = 'sm',
  showIcon = true,
}: OrderStatusBadgeProps) {
  // Normalize string status
  const normalized = (status || '').toString().toUpperCase().replace(/\s+/g, '_');

  let label = 'Placed';
  let colorClasses = 'bg-stone-100 text-stone-800 border-stone-200';
  let IconComponent = Clock;

  switch (normalized) {
    case 'PLACED':
      label = 'Order Placed';
      colorClasses = 'bg-blue-50 text-blue-800 border-blue-200';
      IconComponent = Clock;
      break;
    case 'CONFIRMED':
      label = 'Confirmed';
      colorClasses = 'bg-sky-50 text-sky-800 border-sky-200';
      IconComponent = CheckCircle2;
      break;
    case 'ACCEPTED':
      label = 'Hub Accepted';
      colorClasses = 'bg-indigo-50 text-indigo-800 border-indigo-200';
      IconComponent = CheckCircle2;
      break;
    case 'PICKING':
      label = 'Warehouse Picking';
      colorClasses = 'bg-amber-50 text-amber-800 border-amber-300';
      IconComponent = Boxes;
      break;
    case 'PACKED':
      label = 'Carton Packed';
      colorClasses = 'bg-amber-100 text-amber-900 border-amber-400';
      IconComponent = Package;
      break;
    case 'READY_FOR_DISPATCH':
      label = 'Ready for Dispatch';
      colorClasses = 'bg-teal-50 text-teal-800 border-teal-200';
      IconComponent = Send;
      break;
    case 'OUT_FOR_DELIVERY':
      label = 'Out for Delivery';
      colorClasses = 'bg-purple-50 text-purple-800 border-purple-300 animate-pulse';
      IconComponent = Truck;
      break;
    case 'DELIVERED':
      label = 'Delivered';
      colorClasses = 'bg-emerald-50 text-emerald-800 border-emerald-300';
      IconComponent = CheckCircle2;
      break;
    case 'CANCELLED':
      label = 'Cancelled';
      colorClasses = 'bg-red-50 text-red-700 border-red-200';
      IconComponent = XCircle;
      break;
    default:
      label = status;
      colorClasses = 'bg-stone-100 text-stone-700 border-stone-200';
      IconComponent = AlertCircle;
      break;
  }

  const sizeClasses =
    size === 'lg'
      ? 'px-3 py-1.5 text-xs font-black gap-1.5'
      : size === 'md'
      ? 'px-2.5 py-1 text-[11px] font-bold gap-1'
      : 'px-2 py-0.5 text-[10px] font-bold gap-1';

  const iconSizes =
    size === 'lg' ? 'w-4 h-4' : size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3';

  return (
    <span
      className={`inline-flex items-center rounded-lg border font-mono tracking-tight uppercase ${colorClasses} ${sizeClasses}`}
    >
      {showIcon && <IconComponent className={`${iconSizes} shrink-0`} />}
      <span>{label}</span>
    </span>
  );
}
