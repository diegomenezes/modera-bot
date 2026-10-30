import type { Metadata, Viewport } from "next";
import { Fraunces, Source_Serif_4 } from "next/font/google";
import { Header } from "@/components/Header";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const mono = Source_Serif_4({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Modera Bot",
  description: "Moderação de links nos seus grupos de WhatsApp",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f0e8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${mono.variable} h-full`}>
      <body className="min-h-full antialiased">
        <Header />
        <main className="mx-auto w-full max-w-5xl px-4 pb-16">{children}</main>
      </body>
    </html>
  );
}
