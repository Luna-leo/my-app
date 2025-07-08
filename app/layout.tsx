import type { Metadata } from "next";
import "./globals.css";
import { PlotlyPreloader } from "@/components/PlotlyPreloader";
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
        <PlotlyPreloader>
          <ChartDataProvider>
            {children}
          </ChartDataProvider>
        </PlotlyPreloader>
      </body>
    </html>
  );
}
