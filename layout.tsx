import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Space_Mono } from "next/font/google";
import "./globals.css";
import ClientRootWrapper from "@/components/ClientRootWrapper";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
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
  description: "Controle inteligente das suas finanças pessoais",
  manifest: "/manifest.json",
  // PWA / Apple Web App
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FlowCash",
  },
  // Open Graph para compartilhamento
  openGraph: {
    title: "FlowCash",
    description: "Controle inteligente das suas finanças",
    type: "website",
  },
  // Meta tags adicionais
  other: {
    // Tema da barra de status no iOS
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "FlowCash",
    // Tema para Android Chrome
    "mobile-web-app-capable": "yes",
    "theme-color": "#040B13",
    // Ícone Apple Touch
    "apple-touch-icon": "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#040B13",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${jakarta.variable} ${spaceMono.variable}`}>
      <head>
        {/* Apple Touch Icons — necessário para "Adicionar à Tela de Início" */}
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icon-192.png" />
        <link rel="apple-touch-startup-image" href="/splash.png" />
        {/* Splash screen cor de fundo enquanto carrega */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="FlowCash" />
      </head>
      <body
        style={{
          display: "flex",
          height: "100dvh",
          overflow: "hidden",
          background: "var(--bg)",
        }}
      >
        <ClientRootWrapper>{children}</ClientRootWrapper>
      </body>
    </html>
  );
}
