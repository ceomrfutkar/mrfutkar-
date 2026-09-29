/**
 * Centralized Theme System for MR FUTKAR (MRFutkar India Private Limited)
 * All colors, typography, spacing, buttons, and shapes can be customized here.
 */

export const MR_THEME = {
  brand: {
    name: 'MR FUTKAR',
    companyName: 'MRFutkar India Private Limited',
    tagline: 'Order Thoda Ho Ya Jyada, Achhi Seva Ka Hai Wada',
    secondaryMotto: 'When you grow ! We grow !!',
  },
  colors: {
    // Official Brand Palette extracted from Corporate Identity
    brandNavy: '#0d1d25',
    brandNavyDark: '#061015',
    brandYellow: '#f5b024',
    brandRed: '#e72b2b',
    brandOchre: '#d49b42',
    
    // UI Functional Tones
    bgLight: '#f8fafc',
    surfaceWhite: '#ffffff',
    surfaceCard: '#ffffff',
    surfaceMuted: '#f1f5f9',
    
    borderSubtle: '#e2e8f0',
    borderDefault: '#cbd5e1',
    borderFocus: '#0d1d25',
    
    // Status and Kirana Margins
    stockGreen: '#059669',
    stockGreenBg: '#ecfdf5',
    discountAmber: '#d97706',
    discountAmberBg: '#fffbeb',
    errorRed: '#dc2626',
    errorRedBg: '#fef2f2',
    
    // Text Hierarchy
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#64748b',
    textInverse: '#ffffff',
  },
  typography: {
    title: 'font-black tracking-tight text-slate-900',
    heading: 'font-extrabold tracking-tight text-slate-900',
    subheading: 'font-bold text-slate-800',
    body: 'font-medium text-slate-700',
    caption: 'font-semibold text-xs text-slate-500',
    price: 'font-black text-slate-950',
    marginBadge: 'font-black text-[11px] tracking-wide uppercase',
  },
  shapes: {
    card: 'rounded-2xl',
    cardLg: 'rounded-3xl',
    button: 'rounded-xl',
    input: 'rounded-xl',
    badge: 'rounded-lg',
    pill: 'rounded-full',
  },
  shadows: {
    card: 'shadow-xs hover:shadow-md transition-shadow',
    floating: 'shadow-xl',
    button: 'shadow-sm active:scale-[0.98] transition-all',
  },
} as const;

export type MrTheme = typeof MR_THEME;
