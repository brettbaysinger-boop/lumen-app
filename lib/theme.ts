export type ColorRamp = {
  0?: string;
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  950: string;
};

export type ThemeColors = {
  primary: ColorRamp;
  secondary: ColorRamp;
  accent: ColorRamp;
  success: ColorRamp;
  warning: ColorRamp;
  error: ColorRamp;
  neutral: ColorRamp;
};

// Lumen Turquoise — the signature glow
const lumenTurquoise: ColorRamp = {
  50: '#e6f7f5', 100: '#b8ebe6', 200: '#8adfd9', 300: '#5cd3cb',
  400: '#3ac7be', 500: '#1fb8b0', 600: '#179a93', 700: '#127b76',
  800: '#0d5c59', 900: '#083d3b', 950: '#04221f',
};

// Champagne Gold — ornate accents
const champagneGold: ColorRamp = {
  50: '#fdf8ec', 100: '#f5e8c8', 200: '#edd9a4', 300: '#e4ca80',
  400: '#dabf63', 500: '#c9ad4d', 600: '#ad9242', 700: '#8f7736',
  800: '#705c2a', 900: '#524220', 950: '#3a2f17',
};

// Forest green for success
const forestSuccess: ColorRamp = {
  50: '#e8f5ee', 100: '#c5e6d1', 200: '#9bd4ad', 300: '#6bbd85',
  400: '#4aa86a', 500: '#2d8c50', 600: '#237642', 700: '#1c5f36',
  800: '#174b2c', 900: '#0f3922', 950: '#0a2a18',
};

const warmWarning: ColorRamp = {
  50: '#fef8e8', 100: '#fcecc5', 200: '#f9db9b', 300: '#f5c46b',
  400: '#f0b047', 500: '#e69626', 600: '#cc7e1c', 700: '#a66517',
  800: '#845214', 900: '#6b4210', 950: '#4d2f0b',
};

const coralError: ColorRamp = {
  50: '#feece8', 100: '#fcd2c5', 200: '#f9af9b', 300: '#f5866b',
  400: '#f06747', 500: '#e64a26', 600: '#cc3e1c', 700: '#a63217',
  800: '#842914', 900: '#6b2210', 950: '#4d180b',
};

// Midnight Navy — deep, grounded dark base
const midnightNavy: ColorRamp = {
  0: '#ffffff', 50: '#f5f2ec', 100: '#eae5dc', 200: '#d9d3c9',
  300: '#bcb6ac', 400: '#a39c93', 500: '#938a80', 600: '#8c847b',
  700: '#3b3732', 800: '#282522', 900: '#1b1917', 950: '#100f0e',
};

const pearlCream: ColorRamp = {
  0: '#ffffff', 50: '#182b23', 100: '#233b30', 200: '#344e41',
  300: '#496254', 400: '#596e62', 500: '#6e8175', 600: '#60766a',
  700: '#cbd6ce', 800: '#e1e8e2', 900: '#edf1eb', 950: '#f6f8f3',
};

// Legacy schemes kept for backwards compat
const oceanPrimary: ColorRamp = lumenTurquoise;
const forestPrimary: ColorRamp = {
  50: '#e8f5ee', 100: '#c5e6d1', 200: '#9bd4ad', 300: '#6bbd85',
  400: '#4aa86a', 500: '#2d8c50', 600: '#237642', 700: '#1c5f36',
  800: '#174b2c', 900: '#0f3922', 950: '#0a2a18',
};
const emberPrimary: ColorRamp = {
  50: '#feece8', 100: '#fcd2c5', 200: '#f9af9b', 300: '#f5866b',
  400: '#f06747', 500: '#e64a26', 600: '#cc3e1c', 700: '#a63217',
  800: '#842914', 900: '#6b2210', 950: '#4d180b',
};

const silverPrimary: ColorRamp = {
  50: '#f7f8fa', 100: '#e9edf1', 200: '#d8dfe6', 300: '#c7d0da',
  400: '#b5c0cc', 500: '#939fae', 600: '#596779', 700: '#434f60',
  800: '#303946', 900: '#21272f', 950: '#14181e',
};

export type SchemeId = 'gold-dark' | 'gold-light' | 'silver-dark' | 'silver-light' | 'lumen-dark' | 'lumen-light' | 'ocean-dark' | 'ocean-light' | 'forest-dark' | 'forest-light' | 'ember-dark' | 'ember-light';

export interface SchemeDef {
  id: SchemeId;
  name: string;
  primary: ColorRamp;
  accent: ColorRamp;
  mode: 'dark' | 'light';
}

export const SCHEMES: SchemeDef[] = [
  { id: 'gold-dark', name: 'Gold', primary: champagneGold, accent: silverPrimary, mode: 'dark' },
  { id: 'gold-light', name: 'Gold', primary: champagneGold, accent: silverPrimary, mode: 'light' },
  { id: 'silver-dark', name: 'Silver', primary: silverPrimary, accent: champagneGold, mode: 'dark' },
  { id: 'silver-light', name: 'Silver', primary: silverPrimary, accent: champagneGold, mode: 'light' },
  { id: 'lumen-dark', name: 'Lumen', primary: lumenTurquoise, accent: champagneGold, mode: 'dark' },
  { id: 'lumen-light', name: 'Lumen', primary: lumenTurquoise, accent: champagneGold, mode: 'light' },
  { id: 'ocean-dark', name: 'Ocean', primary: oceanPrimary, accent: champagneGold, mode: 'dark' },
  { id: 'ocean-light', name: 'Ocean', primary: oceanPrimary, accent: champagneGold, mode: 'light' },
  { id: 'forest-dark', name: 'Forest', primary: forestPrimary, accent: champagneGold, mode: 'dark' },
  { id: 'forest-light', name: 'Forest', primary: forestPrimary, accent: champagneGold, mode: 'light' },
  { id: 'ember-dark', name: 'Ember', primary: emberPrimary, accent: champagneGold, mode: 'dark' },
  { id: 'ember-light', name: 'Ember', primary: emberPrimary, accent: champagneGold, mode: 'light' },
];

export interface ExtendedThemeColors extends ThemeColors {
  gold: ColorRamp;
  isDark: boolean;
}

export function getThemeColors(schemeId: SchemeId): ExtendedThemeColors {
  const scheme = SCHEMES.find((s) => s.id === schemeId) || SCHEMES[0];
  const isDark = scheme.mode === 'dark';
  const neutral = isDark ? midnightNavy : pearlCream;
  return {
    primary: isDark ? scheme.primary : { ...scheme.primary, 200: scheme.primary[700], 300: scheme.primary[700], 400: scheme.primary[700] },
    secondary: champagneGold,
    accent: scheme.accent,
    success: forestSuccess,
    warning: warmWarning,
    error: coralError,
    neutral,
    gold: champagneGold,
    isDark,
  };
}

export const Colors: ExtendedThemeColors = getThemeColors('gold-dark');

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 6,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const Typography = {
  fontFamilyRegular: 'Inter-Regular',
  fontFamilyMedium: 'Inter-Medium',
  fontFamilySemiBold: 'Inter-SemiBold',
  fontFamilyBold: 'Inter-Bold',

  heading: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: 'Inter-Bold' as const,
  },
  subheading: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: 'Inter-SemiBold' as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'Inter-Regular' as const,
  },
  bodyMedium: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'Inter-Medium' as const,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter-Regular' as const,
  },
  small: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Inter-Regular' as const,
  },
};
