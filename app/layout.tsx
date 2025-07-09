import type { Metadata } from "next";
import "./globals.css";
// PlotlyPreloader removed - uPlot doesn't need preloading
import { ChartDataProvider } from "@/contexts/ChartDataContext";

export const metadata: Metadata = {
  title: "My App",
  description: "My Next.js application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ChartDataProvider>
          {children}
        </ChartDataProvider>
      </body>
    </html>
  );
}
