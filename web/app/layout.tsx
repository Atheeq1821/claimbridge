import type { Metadata } from "next";
import { JetBrains_Mono, Public_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const serif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"], display: "swap" });
const sans = Public_Sans({ variable: "--font-public-sans", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "ClaimBridge — memory that knows when it's wrong",
  description:
    "An AI caseworker for denied health-insurance claims. Five agents coordinate through a FalkorDB graph, reuse verified resolutions, and refuse precedents that no longer apply.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
