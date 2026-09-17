import type { Metadata, Viewport } from "next";
import { Saira, Saira_Condensed, Saira_Stencil } from "next/font/google";
import { PWARegister } from "@/components/PWARegister";
import "./globals.css";

const saira = Saira({ subsets: ["latin"], variable: "--font-saira", display: "swap" });
const sairaCondensed = Saira_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-saira-condensed",
  display: "swap",
});
const stencil = Saira_Stencil({ subsets: ["latin"], weight: "400", variable: "--font-stencil", display: "swap", adjustFontFallback: false });

export const metadata: Metadata = {
  title: { default: "LockdIn", template: "%s · LockdIn" },
  description: "Training, food, tasks, habits, goals, calendar and journal, with a rule-based fitness coach.",
  applicationName: "LockdIn",
  appleWebApp: { capable: true, title: "LockdIn", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#131313",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${saira.variable} ${sairaCondensed.variable} ${stencil.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
