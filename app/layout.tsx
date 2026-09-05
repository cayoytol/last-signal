import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LAST SIGNAL — Последний сигнал",
  description: "Кооперативная экспедиция на станцию Кеплер-09. Восстановите питание и эвакуируйте отряд.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
