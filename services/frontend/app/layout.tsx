import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LedgerLens — Revenue intelligence",
    template: "%s · LedgerLens",
  },
  description: "Investigate billing gaps, review invoice evidence, and approve safe revenue corrections.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
