import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Space_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import { AppProvider } from "@/context/AppContext";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-space-mono",
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FlowCash — Finanças Pessoais",
  description: "Controle inteligente das suas finanças",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "FlowCash" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${jakarta.variable} ${spaceMono.variable}`}>
      <body
        style={{
          display: "flex",
          height: "100dvh",
          overflow: "hidden",
          background: "var(--bg)",
        }}
      >
        <AppProvider>
          <Sidebar />
          <main style={{ flex: 1, overflowY: "auto", background: "var(--bg)" }}>
            {children}
          </main>
          <BottomNav />
        </AppProvider>
      </body>
    </html>
  );
}
