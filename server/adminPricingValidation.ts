/**
 * MR FUTKAR — Admin Pricing Validation Engine
 * Phase 3B-3: Super Admin Pricing Management Module
 * 
 * Authoritative Server-Side Validation, Overlap Detection,
 * Boundary Clamping, and Monetary Precision Helpers.
 */

import { PriceSlab, PricingType, ProductPricingRule } from '../src/types/product';

export interface PricingRuleValidationInput {
  productId?: string;
  retailerId?: string | null;
  pricingType?: PricingType;
  slabs?: PriceSlab[];
  fixedPrice?: number | null;
  active?: boolean;
  priority?: number;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  ruleDescription?: string;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errors: Array<{ field: string; message: string }>;
  errorSummary: string;
}

/**
 * Normalizes and rounds monetary amounts to 2 decimal places.
 */
export function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Validates a single price slab.
 */
export function validatePriceSlab(
  slab: any,
  index: number
): { valid: boolean; slab?: PriceSlab; errors: Array<{ field: string; message: string }> } {
  const errors: Array<{ field: string; message: string }> = [];

  if (!slab || typeof slab !== 'object') {
    return {
      valid: false,
      errors: [{ field: `slabs[${index}]`, message: 'Slab must be a valid object.' }],
    };
  }

  // Minimum Quantity: Must be integer >= 1
  const minQty = Number(slab.minQuantity ?? slab.quantityFrom);
  if (isNaN(minQty) || !Number.isInteger(minQty) || minQty < 1) {
    errors.push({
      field: `slabs[${index}].minQuantity`,
      message: `Slab minimum quantity must be a positive integer greater than or equal to 1 (received ${slab.minQuantity}).`,
    });
  }

  // Maximum Quantity: If provided, must be integer >= minQty
  let maxQty: number | null = null;
  const rawMax = slab.maxQuantity ?? slab.quantityTo;
  if (rawMax !== undefined && rawMax !== null && rawMax !== '' && rawMax !== 'null') {
    const parsedMax = Number(rawMax);
    if (isNaN(parsedMax) || !Number.isInteger(parsedMax) || parsedMax <= minQty) {
      errors.push({
        field: `slabs[${index}].maxQuantity`,
        message: `Slab maximum quantity must be an integer strictly greater than minimum quantity (${minQty}).`,
      });
    } else {
      maxQty = parsedMax;
    }
  }

  // Price: Must be a non-negative finite number (>= 0)
  const rawPrice = slab.unitPrice ?? slab.slabPrice ?? slab.price;
  const price = Number(rawPrice);
  if (rawPrice === undefined || rawPrice === null || isNaN(price) || !Number.isFinite(price) || price < 0) {
    errors.push({
      field: `slabs[${index}].unitPrice`,
      message: `Slab price must be a non-negative finite number >= 0 (received ${rawPrice}).`,
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const cleanPrice = roundToTwoDecimals(price);

  return {
    valid: true,
    slab: {
      minQuantity: minQty,
      maxQuantity: maxQty,
      unitPrice: cleanPrice,
      slabPrice: cleanPrice,
      price: cleanPrice,
      label: slab.label ? String(slab.label).trim() : undefined,
      active: slab.active !== false,
      priority: slab.priority ? Number(slab.priority) : 1,
    },
    errors: [],
  };
}

/**
 * Validates a list of price slabs for internal consistency (no overlaps, ascending order).
 */
export function validateSlabsArray(
  rawSlabs: any[]
): { valid: boolean; slabs?: PriceSlab[]; errors: Array<{ field: string; message: string }> } {
  const errors: Array<{ field: string; message: string }> = [];

  if (!Array.isArray(rawSlabs) || rawSlabs.length === 0) {
    return {
      valid: false,
      errors: [{ field: 'slabs', message: 'At least one pricing slab must be defined.' }],
    };
  }

  const validSlabs: PriceSlab[] = [];

  for (let i = 0; i < rawSlabs.length; i++) {
    const res = validatePriceSlab(rawSlabs[i], i);
    if (!res.valid || !res.slab) {
      errors.push(...res.errors);
    } else {
      validSlabs.push(res.slab);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Sort by minQuantity ascending
  validSlabs.sort((a, b) => a.minQuantity - b.minQuantity);

  // Check for intra-rule overlaps and open-ended slab position
  for (let i = 0; i < validSlabs.length; i++) {
    const current = validSlabs[i];

    // If an open-ended slab exists, it MUST be the final slab in the array
    if (current.maxQuantity === null || current.maxQuantity === undefined) {
      if (i !== validSlabs.length - 1) {
        errors.push({
          field: `slabs[${i}].maxQuantity`,
          message: 'An open-ended slab (without maximum quantity) must be the last slab (must be on the final slab).',
        });
      }
    }

    if (i > 0) {
      const prev = validSlabs[i - 1];
      const prevMax = prev.maxQuantity ?? Infinity;

      if (current.minQuantity <= prevMax) {
        errors.push({
          field: `slabs[${i}].minQuantity`,
          message: `Overlap detected: Slab quantity range [${current.minQuantity}, ${current.maxQuantity ?? '∞'}] overlaps with preceding slab [${prev.minQuantity}, ${prev.maxQuantity ?? '∞'}].`,
        });
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, slabs: validSlabs, errors: [] };
}

/**
 * Checks if two quantity ranges overlap.
 */
export function doRangesOverlap(
  rangeA: { minQuantity: number; maxQuantity?: number | null },
  rangeB: { minQuantity: number; maxQuantity?: number | null }
): boolean {
  const minA = rangeA.minQuantity;
  const maxA = rangeA.maxQuantity ?? Infinity;
  const minB = rangeB.minQuantity;
  const maxB = rangeB.maxQuantity ?? Infinity;

  return Math.max(minA, minB) <= Math.min(maxA, maxB);
}

/**
 * Validates a pricing rule payload before creation or update.
 */
export function validatePricingRulePayload(
  body: any,
  isUpdate: boolean = false
): ValidationResult<PricingRuleValidationInput> {
  const errors: Array<{ field: string; message: string }> = [];

  if (!body || typeof body !== 'object') {
    return {
      success: false,
      error: 'INVALID_PAYLOAD',
      errors: [{ field: 'body', message: 'Request body must be a valid JSON object.' }],
      errorSummary: 'Request body must be a valid JSON object.',
    };
  }

  // 1. Product ID
  let productId = body.productId ? String(body.productId).trim() : undefined;
  if (!isUpdate && !productId) {
    errors.push({ field: 'productId', message: 'Product ID is required.' });
  }

  // 2. Pricing Type
  const allowedTypes: PricingType[] = ['GLOBAL_SLAB', 'CUSTOMER_SLAB', 'CUSTOMER_FIXED'];
  let pricingType = body.pricingType;
  if (!isUpdate && (!pricingType || !allowedTypes.includes(pricingType))) {
    errors.push({
      field: 'pricingType',
      message: `pricingType is required and must be one of: ${allowedTypes.join(', ')}.`,
    });
  } else if (pricingType && !allowedTypes.includes(pricingType)) {
    errors.push({
      field: 'pricingType',
      message: `Invalid pricingType. Allowed values: ${allowedTypes.join(', ')}.`,
    });
  }

  // 3. Customer ID (retailerId) requirements
  let retailerId: string | null = body.retailerId ? String(body.retailerId).trim() : null;
  if (pricingType === 'CUSTOMER_SLAB' || pricingType === 'CUSTOMER_FIXED') {
    if (!retailerId) {
      errors.push({
        field: 'retailerId',
        message: `Customer (retailerId) is strictly required for rule type ${pricingType}.`,
      });
    }
  } else if (pricingType === 'GLOBAL_SLAB') {
    if (retailerId) {
      retailerId = null; // Enforce null for global slab
    }
  }

  // 4. Validate Slabs or Fixed Price based on rule type
  let validatedSlabs: PriceSlab[] | undefined = undefined;
  let fixedPrice: number | null = null;

  if (pricingType === 'GLOBAL_SLAB' || pricingType === 'CUSTOMER_SLAB') {
    // Slabs may be provided as an array under `slabs`, or as single slab fields `quantityFrom`, `quantityTo`, `unitPrice`
    let rawSlabs = body.slabs || body.priceSlabs;

    if (!rawSlabs && (body.quantityFrom !== undefined || body.minQuantity !== undefined)) {
      rawSlabs = [
        {
          minQuantity: body.quantityFrom ?? body.minQuantity,
          maxQuantity: body.quantityTo ?? body.maxQuantity ?? null,
          unitPrice: body.price ?? body.unitPrice ?? body.slabPrice,
          label: body.label,
        },
      ];
    }

    if (!rawSlabs) {
      errors.push({
        field: 'slabs',
        message: `At least one quantity slab is required for ${pricingType}.`,
      });
    } else {
      const slabRes = validateSlabsArray(rawSlabs);
      if (!slabRes.valid || !slabRes.slabs) {
        errors.push(...slabRes.errors);
      } else {
        validatedSlabs = slabRes.slabs;
      }
    }
  } else if (pricingType === 'CUSTOMER_FIXED') {
    const rawFixed = body.fixedPrice ?? body.price ?? body.unitPrice;
    const p = Number(rawFixed);
    if (rawFixed === undefined || rawFixed === null || isNaN(p) || !Number.isFinite(p) || p < 0) {
      errors.push({
        field: 'fixedPrice',
        message: 'Fixed price must be a non-negative finite number greater than or equal to 0.',
      });
    } else {
      fixedPrice = roundToTwoDecimals(p);
    }
  }

  // 5. Active Status
  const active = body.active !== undefined ? Boolean(body.active) : true;

  // 6. Dates
  const effectiveFrom = body.effectiveFrom ? String(body.effectiveFrom).trim() : null;
  const effectiveTo = body.effectiveTo ? String(body.effectiveTo).trim() : null;
  if (effectiveFrom && effectiveTo && new Date(effectiveFrom) > new Date(effectiveTo)) {
    errors.push({
      field: 'effectiveTo',
      message: 'effectiveTo date must be after effectiveFrom date.',
    });
  }

  if (errors.length > 0) {
    return {
      success: false,
      error: 'INVALID_PRICING_DATA',
      errors,
      errorSummary: errors.map(e => `${e.field}: ${e.message}`).join('; '),
    };
  }

  return {
    success: true,
    data: {
      productId,
      retailerId,
      pricingType,
      slabs: validatedSlabs,
      fixedPrice,
      active,
      priority: body.priority ? Number(body.priority) : undefined,
      effectiveFrom,
      effectiveTo,
      ruleDescription: body.ruleDescription ? String(body.ruleDescription).trim() : undefined,
    },
    errors: [],
    errorSummary: '',
  };
}

/**
 * Validates whether proposed slabs or fixed price conflict with existing active rules in the system.
 */
export function checkPricingConflicts(params: {
  existingRules: ProductPricingRule[];
  ruleIdToExclude?: string;
  productId: string;
  retailerId?: string | null;
  pricingType: PricingType;
  slabs?: PriceSlab[];
  fixedPrice?: number;
}): { hasConflict: boolean; conflictReason?: string; conflictingRuleId?: string } {
  const {
    existingRules,
    ruleIdToExclude,
    productId,
    retailerId,
    pricingType,
    slabs,
  } = params;

  // Filter rules for the same product and active status
  const candidateRules = existingRules.filter(r => {
    if (ruleIdToExclude && (r.id === ruleIdToExclude || r.pricingId === ruleIdToExclude)) return false;
    if (r.productId !== productId) return false;
    if (r.active === false) return false; // Inactive rules do not conflict
    return true;
  });

  if (pricingType === 'CUSTOMER_FIXED') {
    // Only one active CUSTOMER_FIXED rule per (productId, retailerId)
    const duplicateFixed = candidateRules.find(
      r => r.pricingType === 'CUSTOMER_FIXED' && r.retailerId === retailerId
    );
    if (duplicateFixed) {
      return {
        hasConflict: true,
        conflictReason: `An active CUSTOMER_FIXED rule already exists for customer '${retailerId}' on this product (Rule ID: ${duplicateFixed.id || duplicateFixed.pricingId}).`,
        conflictingRuleId: duplicateFixed.id || duplicateFixed.pricingId,
      };
    }
  }

  if (pricingType === 'GLOBAL_SLAB' && slabs && slabs.length > 0) {
    // Check against all active GLOBAL_SLAB rules for the same product
    const globalRules = candidateRules.filter(r => r.pricingType === 'GLOBAL_SLAB');
    for (const rule of globalRules) {
      const existingSlabs = rule.slabs || rule.priceSlabs || [];
      for (const newSlab of slabs) {
        for (const existSlab of existingSlabs) {
          const overlaps = doRangesOverlap(newSlab, existSlab);
          if (overlaps) {
            return {
              hasConflict: true,
              conflictReason: `Slab [${newSlab.minQuantity}, ${newSlab.maxQuantity ?? '∞'}] overlaps with existing GLOBAL_SLAB [${existSlab.minQuantity}, ${existSlab.maxQuantity ?? '∞'}] in rule ${rule.id || rule.pricingId}.`,
              conflictingRuleId: rule.id || rule.pricingId,
            };
          }
        }
      }
    }
  }

  if (pricingType === 'CUSTOMER_SLAB' && slabs && slabs.length > 0) {
    // Check against all active CUSTOMER_SLAB rules for the SAME customer and product
    const custRules = candidateRules.filter(
      r => r.pricingType === 'CUSTOMER_SLAB' && r.retailerId === retailerId
    );
    for (const rule of custRules) {
      const existingSlabs = rule.slabs || rule.priceSlabs || [];
      for (const newSlab of slabs) {
        for (const existSlab of existingSlabs) {
          if (doRangesOverlap(newSlab, existSlab)) {
            return {
              hasConflict: true,
              conflictReason: `Slab [${newSlab.minQuantity}, ${newSlab.maxQuantity ?? '∞'}] overlaps with existing CUSTOMER_SLAB [${existSlab.minQuantity}, ${existSlab.maxQuantity ?? '∞'}] for customer '${retailerId}' in rule ${rule.id || rule.pricingId}.`,
              conflictingRuleId: rule.id || rule.pricingId,
            };
          }
        }
      }
    }
  }

  return { hasConflict: false };
}
