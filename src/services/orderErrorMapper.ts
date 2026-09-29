/**
 * Retailer Order Error Code Mapper
 * Converts backend validation and transaction error codes into clear, actionable,
 * retailer-friendly UI messages for kirana store owners.
 */

export const ORDER_ERROR_MESSAGES: Record<string, string> = {
  INVALID_PRODUCT: 'One or more products in your cart could not be found. Please review your cart.',
  PRODUCT_INACTIVE: 'Some products in your cart are currently inactive or discontinued. Please review your cart.',
  INSUFFICIENT_STOCK: 'Some products are no longer available in the requested quantity. Please review your cart.',
  MOQ_NOT_MET: 'Minimum order quantity (MOQ) has not been met for one or more products. Please check quantities.',
  MINIMUM_ORDER_NOT_MET: 'Minimum wholesale order value has not been reached. Please add more items to proceed.',
  INVALID_PAYMENT_METHOD: 'The selected payment method is not available. Please choose another payment method.',
  INVALID_PAYMENT_STATUS: 'Payment status cannot be set by the retailer app.',
  INVALID_ORDER_STATUS: 'Orders must be placed with status PLACED.',
  ORDER_ALREADY_EXISTS: 'This order has already been processed.',
  UNAUTHORIZED: 'You must be signed in to place a wholesale order. Please verify your login.',
  MISSING_IDEMPOTENCY_KEY: 'Unable to verify order uniqueness. Please retry placing your order.',
  SERVER_ERROR: 'Unable to process wholesale order at the warehouse. Please try again.',
};

export function mapOrderError(rawError: any): string {
  if (!rawError) {
    return 'Failed to submit order to warehouse. Please try again.';
  }

  const errStr = typeof rawError === 'string' ? rawError : rawError.message || rawError.error || '';

  for (const [code, userMessage] of Object.entries(ORDER_ERROR_MESSAGES)) {
    if (errStr.includes(code)) {
      return userMessage;
    }
  }

  return errStr || 'Failed to submit order to warehouse. Please try again.';
}
