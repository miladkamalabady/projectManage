import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "سامانه کنترل پروژه سمپاد",
  description: "پیگیری فعالیت‌ها، ددلاین‌ها، تأییدها، اشکالات و مصوبات پروژه سامانه سمپاد",
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
    <html lang="fa" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
