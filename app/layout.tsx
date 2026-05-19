// Root layout. With locale-prefix routing the real html/body/font/intl
// setup lives in app/[locale]/layout.tsx — this file exists only to
// satisfy Next.js's "every app needs a root layout" requirement and to
// pass children through transparently.

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
