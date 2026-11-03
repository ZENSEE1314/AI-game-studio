import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Platform Admin' };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
