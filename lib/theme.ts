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

const oceanPrimary: ColorRamp = {
  50: '#e8f1f5', 100: '#c5dbe5', 200: '#9bc1d1', 300: '#6ba0b8',
  400: '#4a8ba0', 500: '#2d6b80', 600: '#225a6c', 700: '#1c4858',
  800: '#173a47', 900: '#0f2a35', 950: '#0a1d26',
};

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

const sharedSecondary: ColorRamp = {
  50: '#fef3e8', 100: '#fce0c5', 200: '#f9c89b', 300: '#f5a86b',
  400: '#f08d47', 500: '#e67326', 600: '#cc5e1c', 700: '#a64a17',
  800: '#843c14', 900: '#6b3110', 950: '#4d230b',
};

const sharedAccent: ColorRamp = {
  50: '#e8f5f0', 100: '#c5e6d8', 200: '#9bd4ba', 300: '#6bbd97',
  400: '#4aa87d', 500: '#2d8c63', 600: '#237650', 700: '#1c5f42',
  800: '#174b35', 900: '#0f3929', 950: '#0a2a1e',
};

const sharedSuccess: ColorRamp = {
  50: '#e8f5ee', 100: '#c5e6d1', 200: '#9bd4ad', 300: '#6bbd85',
  400: '#4aa86a', 500: '#2d8c50', 600: '#237642', 700: '#1c5f36',
  800: '#174b2c', 900: '#0f3922', 950: '#0a2a18',
};

const sharedWarning: ColorRamp = {
  50: '#fef8e8', 100: '#fcecc5', 200: '#f9db9b', 300: '#f5c46b',
  400: '#f0b047', 500: '#e69626', 600: '#cc7e1c', 700: '#a66517',
  800: '#845214', 900: '#6b4210', 950: '#4d2f0b',
};

const sharedError: ColorRamp = {
  50: '#feece8', 100: '#fcd2c5', 200: '#f9af9b', 300: '#f5866b',
  400: '#f06747', 500: '#e64a26', 600: '#cc3e1c', 700: '#a63217',
  800: '#842914', 900: '#6b2210', 950: '#4d180b',
};

const darkNeutral: ColorRamp = {
  0: '#ffffff',
  50: '#f7f8f9',
  100: '#eef0f2',
  200: '#dde1e5',
  300: '#c2c8cf',
  400: '#9ba3ad',
  500: '#737d8a',
  600: '#5a6370',
  700: '#474e59',
  800: '#393f48',
  900: '#2d323a',
  950: '#1c2025',
};

const lightNeutral: ColorRamp = {
  0: '#ffffff',
  50: '#f7f8f9',
  100: '#1c2025',
  200: '#2d323a',
  300: '#393f48',
  400: '#5a6370',
  500: '#737d8a',
  600: '#9ba3ad',
  700: '#c2c8cf',
  800: '#eef0f2',
  900: '#ffffff',
  950: '#f5f6f8',
};

export type SchemeId = 'ocean-dark' | 'ocean-light' | 'forest-dark' | 'forest-light' | 'ember-dark' | 'ember-light';

export interface SchemeDef {
  id: SchemeId;
  name: string;
  primary: ColorRamp;
  mode: 'dark' | 'light';
}

export const SCHEMES: SchemeDef[] = [
  { id: 'ocean-dark', name: 'Ocean', primary: oceanPrimary, mode: 'dark' },
  { id: 'ocean-light', name: 'Ocean', primary: oceanPrimary, mode: 'light' },
  { id: 'forest-dark', name: 'Forest', primary: forestPrimary, mode: 'dark' },
  { id: 'forest-light', name: 'Forest', primary: forestPrimary, mode: 'light' },
  { id: 'ember-dark', name: 'Ember', primary: emberPrimary, mode: 'dark' },
  { id: 'ember-light', name: 'Ember', primary: emberPrimary, mode: 'light' },
];

export function getThemeColors(schemeId: SchemeId): ThemeColors {
  const scheme = SCHEMES.find((s) => s.id === schemeId) || SCHEMES[0];
  const neutral = scheme.mode === 'dark' ? darkNeutral : lightNeutral;
  return {
    primary: scheme.primary,
    secondary: sharedSecondary,
    accent: sharedAccent,
    success: sharedSuccess,
    warning: sharedWarning,
    error: sharedError,
    neutral,
  };
}

export const Colors: ThemeColors = getThemeColors('ocean-dark');

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
