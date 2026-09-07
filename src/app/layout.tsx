import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import PageTransition from "@/components/PageTransition";

export const metadata: Metadata = {
  title: "MonAlternance",
  description: "Trouve et adapte ton CV pour chaque offre d'emploi ou d'alternance.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen">
        <ServiceWorkerRegister />
        <Nav />
        <main className="mx-auto max-w-5xl px-4 py-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </body>
    </html>
  );
}
