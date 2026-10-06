import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "APEX | Business Dashboard",
    template: "%s | APEX",
  },
  description:
    "Private business dashboard for APEX Panelboard and Electrical Fabrication Corp.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-screen bg-background text-foreground">
        <header className="apex-brand-header">
  <div className="apex-brand-header-inner">
    <Link
      href="/dashboard"
      className="apex-brand-link"
      aria-label="APEX dashboard"
    >
      <Image
        src="/apex-logo.png"
        alt="APEX Panelboard and Electrical Fabrication Corp."
        width={2048}
        height={683}
        priority
        className="apex-brand-logo"
      />
    </Link>

    <div className="apex-brand-heading">
      <span className="apex-brand-eyebrow">
        APEX Workspace
      </span>

      <p className="apex-brand-caption">
        Business Management System
      </p>
    </div>
  </div>
</header>

        {children}
      </body>
    </html>
  );
}