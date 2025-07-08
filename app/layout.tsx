import type { Metadata } from "next";
import "./globals.css";
import { PlotlyPreloader } from "@/components/PlotlyPreloader";

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
          {children}
        </PlotlyPreloader>
      </body>
    </html>
  );
}
