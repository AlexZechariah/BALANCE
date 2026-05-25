import type { Metadata } from 'next';
import { Figtree, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../context/auth-context';
import { MotionProvider } from '../components/motion-provider';
import { ThemeProvider } from '../components/theme-provider';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'Balance',
  description: 'Document intelligence for receipts, invoices, review queues, spend insights, and audit trails',
};

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-figtree',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${figtree.variable} ${jetbrainsMono.variable}`}>
        <ThemeProvider>
          <MotionProvider>
            <AuthProvider>{children}</AuthProvider>
            <Toaster richColors position="bottom-right" />
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
