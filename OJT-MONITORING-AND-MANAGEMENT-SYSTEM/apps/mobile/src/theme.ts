// Shared look for the student app: one set of colors and header text styles so screens read as one app.
export const colors = {
  ink: '#0A3824',
  bg: '#F6F8F5',
  surface: '#FFFEFB',
  line: '#DCE5DB',
  muted: '#7A887D',
  tint: '#E6EFE7',
  text: '#1F2A22',
};

export const type = {
  kicker: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1, color: colors.muted, textTransform: 'uppercase' as const },
  title: { fontSize: 28, fontWeight: '800' as const, color: colors.ink },
};
