import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import SiteNav from "@/components/SiteNav";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Baseball Hopper",
  description:
    "The unified home for Balls & Sticks baseball tools — scatter plots, splits, grades, and more, cross-referenced around a shared player identity.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--text)]">
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
