// Shared look for the student app: one set of colors and header text styles so screens read as one app.
export const colors = {
  ink: '#0A3824',
  bg: '#F4F6F2',
  surface: '#FFFEFB',
  line: '#DCE5DB',
  muted: '#5A6A5E',
  tint: '#EDF2EB',
  text: '#18271D',
  deep: '#092E1D',
  sand: '#E4DBC4',
  danger: '#B91C1C',
};

// Loaded in App.tsx; if loading fails React Native falls back to the system font.
export const fonts = {
  display: 'Outfit_800ExtraBold',
  body: 'PlusJakartaSans_500Medium',
  bold: 'PlusJakartaSans_700Bold',
};

export const type = {
  kicker: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1, color: colors.muted, textTransform: 'uppercase' as const },
  title: { fontSize: 28, fontWeight: '800' as const, color: colors.ink },
};
