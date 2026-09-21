import { Outfit, Inter } from "next/font/google";
import "./globals.css";
import Tracker from "../components/Tracker";

const outfit = Outfit({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });

export const metadata = {
  title: "Vreedits",
  description: "AI workspace, productivity, and community — one platform.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className={`${outfit.variable} ${inter.variable}`} style={{ fontFamily: "var(--font-body)" }}>
        <Tracker />
        {children}
      </body>
    </html>
  );
}