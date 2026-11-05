import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'AuraReserve — Cloud-Native Loss Reserving & Actuarial Platform',
  description:
    'Next-generation actuarial loss reserving platform featuring interactive link-ratio outlier exclusion, Chain Ladder / Bornhuetter-Ferguson / Cape Cod methods, Mack’s stochastic model, Tail Curve Fitting, and ODP Bootstrap IFRS 17 / Solvency II risk capital simulation.',
  openGraph: {
    title: 'AuraReserve — Cloud-Native Loss Reserving & Actuarial Platform',
    description:
      'Next-generation actuarial loss reserving platform featuring interactive link-ratio outlier exclusion, Chain Ladder / Bornhuetter-Ferguson / Cape Cod methods, Mack’s stochastic model, Tail Curve Fitting, and ODP Bootstrap IFRS 17 / Solvency II risk capital simulation.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AuraReserve — Cloud-Native Loss Reserving & Actuarial Platform',
    description:
      'Next-generation actuarial loss reserving platform featuring interactive link-ratio outlier exclusion, Chain Ladder / Bornhuetter-Ferguson / Cape Cod methods, Mack’s stochastic model, Tail Curve Fitting, and ODP Bootstrap IFRS 17 / Solvency II risk capital simulation.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body
        style={{ fontFamily: 'var(--font-sans), sans-serif' }}
        className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased min-h-screen selection:bg-sky-500 selection:text-white"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
