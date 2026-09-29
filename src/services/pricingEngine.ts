import { Product, PriceSlab, ProductPricingRule } from '../types/product';

export interface PriceResolutionParams {
  product: Product;
  quantity: number;
  retailerId?: string;
  customerPricingRules?: ProductPricingRule[];
  now?: Date;
}

export interface ResolvedPrice {
  unitPrice: number;
  pricingSource: 'CUSTOMER_SLAB' | 'CUSTOMER_FIXED' | 'GLOBAL_SLAB' | 'DEFAULT';
  pricingId: string;
  slabMinQuantity?: number;
  slabMaxQuantity?: number | null;
  rule?: ProductPricingRule;
}

export interface PricingBreakdown {
  quantity: number;
  unitPrice: number;
  mrp: number;
  subtotal: number;
  totalMrp: number;
  totalSavings: number;
  savingsPercent: number;
  pricingSource: 'CUSTOMER_SLAB' | 'CUSTOMER_FIXED' | 'GLOBAL_SLAB' | 'DEFAULT';
  pricingId: string;
  isCustomerSpecific: boolean;
  activeSlab?: PriceSlab;
  applicableSlabs?: PriceSlab[];
  nextSlab?: {
    slab: PriceSlab;
    unitsNeeded: number;
    extraSavingsPerUnit: number;
  };
}

/**
 * Validates a list of price slabs for correctness and non-overlapping integrity.
 * Rules:
 * - minQuantity >= 1
 * - maxQuantity is null/undefined OR maxQuantity >= minQuantity
 * - unitPrice >= 0
 * - Inactive slabs (active === false) are ignored
 * - Overlapping active slabs must be rejected
 */
export function validatePriceSlabs(slabs: PriceSlab[]): { valid: boolean; error?: string } {
  if (!slabs || slabs.length === 0) return { valid: true };

  const activeSlabs = slabs.filter(s => s.active !== false);
  if (activeSlabs.length === 0) return { valid: true };

  for (const s of activeSlabs) {
    if (typeof s.minQuantity !== 'number' || !Number.isFinite(s.minQuantity) || s.minQuantity < 1) {
      return { valid: false, error: 'minQuantity must be a positive integer >= 1' };
    }
    if (s.maxQuantity !== undefined && s.maxQuantity !== null) {
      if (typeof s.maxQuantity !== 'number' || !Number.isFinite(s.maxQuantity) || s.maxQuantity < s.minQuantity) {
        return { valid: false, error: `maxQuantity (${s.maxQuantity}) must be null or >= minQuantity (${s.minQuantity})` };
      }
    }
    const price = s.unitPrice ?? s.slabPrice ?? s.price;
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
      return { valid: false, error: 'unitPrice must be a valid number >= 0' };
    }
  }

  // Sort ascending by minQuantity to check boundary intervals
  const sorted = [...activeSlabs].sort((a, b) => a.minQuantity - b.minQuantity);

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    if (current.minQuantity === next.minQuantity) {
      return { valid: false, error: `Duplicate minQuantity ${current.minQuantity} found in slabs` };
    }

    // Unlimited slab encompasses all quantities >= current.minQuantity
    if (current.maxQuantity === undefined || current.maxQuantity === null) {
      return {
        valid: false,
        error: `Slab [${current.minQuantity}+] is unlimited, so subsequent slab [${next.minQuantity}] is overlapping`,
      };
    }

    // Overlapping max vs next min
    if (current.maxQuantity >= next.minQuantity) {
      return {
        valid: false,
        error: `Overlapping slabs: [${current.minQuantity}–${current.maxQuantity}] overlaps with [${next.minQuantity}–${next.maxQuantity ?? 'unlimited'}]`,
      };
    }
  }

  return { valid: true };
}

/**
 * Checks whether two time windows overlap.
 */
export function areDateRangesOverlapping(
  fromA?: string | null,
  toA?: string | null,
  fromB?: string | null,
  toB?: string | null
): boolean {
  const startA = fromA ? new Date(fromA).getTime() : -Infinity;
  const endA = toA ? new Date(toA).getTime() : Infinity;
  const startB = fromB ? new Date(fromB).getTime() : -Infinity;
  const endB = toB ? new Date(toB).getTime() : Infinity;

  return startA <= endB && startB <= endA;
}

/**
 * Evaluates whether a pricing rule is currently effective based on active flag and effectiveFrom/To.
 */
export function isPricingEffective(rule: ProductPricingRule, now: Date = new Date()): boolean {
  if (rule.active === false) return false;
  const nowMs = now.getTime();

  if (rule.effectiveFrom) {
    const fromMs = new Date(rule.effectiveFrom).getTime();
    if (!isNaN(fromMs) && nowMs < fromMs) {
      return false; // Future pricing not active yet
    }
  }

  if (rule.effectiveTo) {
    const toMs = new Date(rule.effectiveTo).getTime();
    if (!isNaN(toMs) && nowMs > toMs) {
      return false; // Expired pricing
    }
  }

  return true;
}

export class PricingEngine {
  /**
   * The single, authoritative price resolution function (Phase 2C Part 2).
   * Exact Priority:
   * 1. Customer-specific quantity pricing (CUSTOMER_SLAB)
   * 2. Customer-specific fixed price (CUSTOMER_FIXED)
   * 3. Global quantity slab pricing (GLOBAL_SLAB)
   * 4. Product default wholesale price (DEFAULT)
   */
  public static resolveProductPrice(params: PriceResolutionParams): ResolvedPrice {
    const { product, retailerId, customerPricingRules = [] } = params;
    const now = params.now || new Date();
    const qty = Math.max(1, Math.round(params.quantity || 1));
    const targetProdId = product.productId || (product as any).id;

    // Filter rules relevant to this product
    const relevantRules = customerPricingRules.filter(
      r => (r.productId === targetProdId || r.productId === product.productId || r.productId === (product as any).id)
    );

    // =======================================================================
    // CUSTOMER-SPECIFIC PRICING (Tied strictly to authenticated retailerId)
    // =======================================================================
    if (retailerId) {
      const activeCustomerRules = relevantRules.filter(
        r => r.retailerId === retailerId && isPricingEffective(r, now)
      );

      // Validation: Check for conflicting duplicate CUSTOMER_FIXED rules
      const customerFixedRules = activeCustomerRules.filter(r => r.pricingType === 'CUSTOMER_FIXED');
      if (customerFixedRules.length > 1) {
        for (let i = 0; i < customerFixedRules.length - 1; i++) {
          for (let j = i + 1; j < customerFixedRules.length; j++) {
            if (
              areDateRangesOverlapping(
                customerFixedRules[i].effectiveFrom,
                customerFixedRules[i].effectiveTo,
                customerFixedRules[j].effectiveFrom,
                customerFixedRules[j].effectiveTo
              )
            ) {
              throw new Error(
                `Conflicting active customer fixed pricing rules detected for retailer ${retailerId} and product ${targetProdId}`
              );
            }
          }
        }
      }

      // Validation: Check for conflicting duplicate CUSTOMER_SLAB rules
      const customerSlabRules = activeCustomerRules.filter(r => r.pricingType === 'CUSTOMER_SLAB');
      if (customerSlabRules.length > 1) {
        for (let i = 0; i < customerSlabRules.length - 1; i++) {
          for (let j = i + 1; j < customerSlabRules.length; j++) {
            if (
              areDateRangesOverlapping(
                customerSlabRules[i].effectiveFrom,
                customerSlabRules[i].effectiveTo,
                customerSlabRules[j].effectiveFrom,
                customerSlabRules[j].effectiveTo
              )
            ) {
              throw new Error(
                `Conflicting active customer slab pricing rules detected for retailer ${retailerId} and product ${targetProdId}`
              );
            }
          }
        }
      }

      // PRIORITY 1: Customer-specific quantity pricing (CUSTOMER_SLAB)
      for (const rule of customerSlabRules) {
        const ruleSlabs = rule.slabs || rule.priceSlabs;
        if (ruleSlabs && ruleSlabs.length > 0) {
          const val = validatePriceSlabs(ruleSlabs);
          if (!val.valid) {
            throw new Error(`Invalid customer slab configuration: ${val.error}`);
          }

          // Sort descending by minQuantity to find the highest threshold satisfied
          const activeSlabs = ruleSlabs.filter((s: PriceSlab) => s.active !== false);
          const sorted = [...activeSlabs].sort((a, b) => b.minQuantity - a.minQuantity);
          const matchedSlab = sorted.find(
            s => qty >= s.minQuantity && (s.maxQuantity === undefined || s.maxQuantity === null || qty <= s.maxQuantity)
          );

          if (matchedSlab) {
            const slabUnitPrice = matchedSlab.unitPrice ?? matchedSlab.slabPrice ?? matchedSlab.price;
            if (slabUnitPrice !== undefined) {
              return {
                unitPrice: slabUnitPrice,
                pricingSource: 'CUSTOMER_SLAB',
                pricingId: rule.pricingId || rule.id || `rule-cust-slab-${retailerId}`,
                slabMinQuantity: matchedSlab.minQuantity,
                slabMaxQuantity: matchedSlab.maxQuantity ?? null,
                rule,
              };
            }
          }
        }
      }

      // PRIORITY 2: Customer-specific fixed price (CUSTOMER_FIXED)
      const validFixedRule = customerFixedRules.find(
        r => typeof r.fixedPrice === 'number' && Number.isFinite(r.fixedPrice) && r.fixedPrice >= 0
      );
      if (validFixedRule && validFixedRule.fixedPrice !== undefined) {
        return {
          unitPrice: validFixedRule.fixedPrice,
          pricingSource: 'CUSTOMER_FIXED',
          pricingId: validFixedRule.pricingId || validFixedRule.id || `rule-cust-fixed-${retailerId}`,
          slabMinQuantity: undefined,
          slabMaxQuantity: undefined,
          rule: validFixedRule,
        };
      }
    }

    // =======================================================================
    // PRIORITY 3: Global quantity slab pricing (GLOBAL_SLAB)
    // =======================================================================
    let globalSlabs: PriceSlab[] | undefined;
    let globalPricingId = 'global-slabs';
    let matchedGlobalRule: ProductPricingRule | undefined;

    // Check external rules collection for active global slabs
    const globalRule = relevantRules.find(
      r => (!r.retailerId || r.retailerId === '') && r.pricingType === 'GLOBAL_SLAB' && isPricingEffective(r, now)
    );

    if (globalRule && globalRule.slabs && globalRule.slabs.length > 0) {
      globalSlabs = globalRule.slabs;
      globalPricingId = globalRule.pricingId || globalRule.id || 'global-slabs';
      matchedGlobalRule = globalRule;
    } else if (product.priceSlabs && product.priceSlabs.length > 0) {
      globalSlabs = product.priceSlabs;
    }

    if (globalSlabs && globalSlabs.length > 0) {
      const val = validatePriceSlabs(globalSlabs);
      if (!val.valid) {
        throw new Error(`Invalid global quantity slabs configuration: ${val.error}`);
      }

      const activeSlabs = globalSlabs.filter(s => s.active !== false);
      const sorted = [...activeSlabs].sort((a, b) => b.minQuantity - a.minQuantity);
      const matchedSlab = sorted.find(
        s => qty >= s.minQuantity && (s.maxQuantity === undefined || s.maxQuantity === null || qty <= s.maxQuantity)
      );

      if (matchedSlab) {
        const slabUnitPrice = matchedSlab.unitPrice ?? matchedSlab.slabPrice ?? matchedSlab.price;
        if (slabUnitPrice !== undefined) {
          return {
            unitPrice: slabUnitPrice,
            pricingSource: 'GLOBAL_SLAB',
            pricingId: globalPricingId,
            slabMinQuantity: matchedSlab.minQuantity,
            slabMaxQuantity: matchedSlab.maxQuantity ?? null,
            rule: matchedGlobalRule,
          };
        }
      }
    }

    // =======================================================================
    // PRIORITY 4: Product default wholesale price (DEFAULT)
    // =======================================================================
    const defaultPrice = Number(product.wholesalePrice) || Number(product.sellingPrice) || Number(product.mrp) || 0;
    return {
      unitPrice: defaultPrice,
      pricingSource: 'DEFAULT',
      pricingId: 'product-default',
    };
  }

  /**
   * Helper function to calculate applicable unit price.
   */
  public static calculateUnitPrice(
    product: Product,
    quantity: number,
    retailerId?: string,
    customerPricingRules?: ProductPricingRule[],
    now?: Date
  ): number {
    return this.resolveProductPrice({
      product,
      quantity,
      retailerId,
      customerPricingRules,
      now,
    }).unitPrice;
  }

  /**
   * Computes full wholesale pricing breakdown including savings, margin, and next tier incentive.
   */
  public static getPricingBreakdown(
    product: Product,
    quantity: number,
    retailerId?: string,
    customerPricingRules?: ProductPricingRule[],
    now?: Date
  ): PricingBreakdown {
    const qty = Math.max(1, Math.round(quantity || 1));
    const resolved = this.resolveProductPrice({
      product,
      quantity: qty,
      retailerId,
      customerPricingRules,
      now,
    });

    const unitPrice = resolved.unitPrice;
    const mrp = Number(product.mrp) || unitPrice;
    const subtotal = Math.round(unitPrice * qty * 100) / 100;
    const totalMrp = Math.round(mrp * qty * 100) / 100;
    const totalSavings = Math.max(0, Math.round((totalMrp - subtotal) * 100) / 100);
    const savingsPercent = totalMrp > 0 ? Math.round((totalSavings / totalMrp) * 100) : 0;
    const isCustomerSpecific = resolved.pricingSource === 'CUSTOMER_SLAB' || resolved.pricingSource === 'CUSTOMER_FIXED';

    // Determine applicable slabs list for display
    let applicableSlabs: PriceSlab[] | undefined;
    const ruleSlabs = resolved.rule?.slabs || resolved.rule?.priceSlabs;
    if (resolved.pricingSource === 'CUSTOMER_SLAB' && ruleSlabs) {
      applicableSlabs = ruleSlabs.filter((s: PriceSlab) => s.active !== false);
    } else if (ruleSlabs) {
      applicableSlabs = ruleSlabs.filter((s: PriceSlab) => s.active !== false);
    } else if (product.priceSlabs) {
      applicableSlabs = product.priceSlabs.filter((s: PriceSlab) => s.active !== false);
    }

    // Determine active slab if applicable
    let activeSlab: PriceSlab | undefined;
    if (applicableSlabs && (resolved.pricingSource === 'CUSTOMER_SLAB' || resolved.pricingSource === 'GLOBAL_SLAB')) {
      const sorted = [...applicableSlabs].sort((a, b) => b.minQuantity - a.minQuantity);
      activeSlab = sorted.find(
        s => qty >= s.minQuantity && (s.maxQuantity === undefined || s.maxQuantity === null || qty <= s.maxQuantity)
      );
    }

    // Determine next slab incentive
    let nextSlab: PricingBreakdown['nextSlab'];
    if (applicableSlabs) {
      const sortedAsc = [...applicableSlabs].sort((a, b) => a.minQuantity - b.minQuantity);
      const upcoming = sortedAsc.find(s => s.minQuantity > qty);
      if (upcoming) {
        const nextPrice = upcoming.unitPrice ?? upcoming.slabPrice ?? upcoming.price ?? unitPrice;
        nextSlab = {
          slab: upcoming,
          unitsNeeded: upcoming.minQuantity - qty,
          extraSavingsPerUnit: Math.max(0, unitPrice - nextPrice),
        };
      }
    }

    return {
      quantity: qty,
      unitPrice,
      mrp,
      subtotal,
      totalMrp,
      totalSavings,
      savingsPercent,
      pricingSource: resolved.pricingSource,
      pricingId: resolved.pricingId,
      isCustomerSpecific,
      activeSlab,
      applicableSlabs,
      nextSlab,
    };
  }

  /**
   * Converts a specified number of cases into discrete units.
   */
  public static convertCasesToUnits(product: Product, cases: number): number {
    const caseQty = product.caseQuantity > 0 ? product.caseQuantity : 1;
    return Math.max(0, cases) * caseQty;
  }

  /**
   * Decomposes total units into full cases and leftover loose units.
   */
  public static convertUnitsToCases(
    product: Product,
    units: number
  ): { fullCases: number; looseUnits: number } {
    const caseQty = product.caseQuantity > 0 ? product.caseQuantity : 1;
    const fullCases = Math.floor(units / caseQty);
    const looseUnits = units % caseQty;
    return { fullCases, looseUnits };
  }

  /**
   * Formats a monetary number in Indian INR currency standard.
   */
  public static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    })
      .format(amount)
      .replace('INR', '₹')
      .trim();
  }

  /**
   * Validates price slabs for ordering, bounds and non-overlapping intervals.
   */
  public static validateSlabs(slabs: PriceSlab[]): { valid: boolean; error?: string } {
    return validatePriceSlabs(slabs);
  }

  /**
   * Validates that an order price is non-negative and finite.
   */
  public static validatePrice(price: any): { valid: boolean; error?: string } {
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
      return { valid: false, error: 'Price must be a valid positive number >= 0' };
    }
    return { valid: true };
  }

  /**
   * Validates order quantity constraints:
   * - Positive whole integer
   * - Meets minimum order quantity (MOQ)
   * - Does not exceed available stockQuantity
   * - Product is active
   */
  public static validateOrderQuantity(
    quantity: any,
    product: Product
  ): { valid: boolean; errorCode?: string; message?: string } {
    if (product.isActive === false) {
      return { valid: false, errorCode: 'PRODUCT_INACTIVE', message: 'Product is currently inactive' };
    }
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
      return { valid: false, errorCode: 'INVALID_QUANTITY', message: 'Quantity must be a positive whole number' };
    }
    const moq = Number(product.minimumOrderQuantity) || 1;
    if (quantity < moq) {
      return { valid: false, errorCode: 'MOQ_NOT_MET', message: `Minimum order quantity is ${moq}` };
    }
    const stock = Number(product.stockQuantity ?? (product as any).stock ?? 0);
    if (quantity > stock) {
      return { valid: false, errorCode: 'INSUFFICIENT_STOCK', message: `Requested quantity exceeds available stock (${stock})` };
    }
    return { valid: true };
  }

  /**
   * Checks for duplicate active customer fixed pricing for the same retailer and product.
   */
  public static validateFixedPricingDuplicate(
    existingRules: ProductPricingRule[],
    retailerId: string,
    productId: string,
    effectiveFrom?: string | null,
    effectiveTo?: string | null
  ): { valid: boolean; error?: string } {
    const duplicates = existingRules.filter(
      r =>
        r.retailerId === retailerId &&
        r.productId === productId &&
        r.pricingType === 'CUSTOMER_FIXED' &&
        r.active !== false &&
        areDateRangesOverlapping(r.effectiveFrom, r.effectiveTo, effectiveFrom, effectiveTo)
    );
    if (duplicates.length > 0) {
      return {
        valid: false,
        error: `Active fixed pricing rule already exists for retailer ${retailerId} and product ${productId}`,
      };
    }
    return { valid: true };
  }
}
