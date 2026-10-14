import "./globals.css";
import "./vreedits-layout.css";
import Tracker from "../components/Tracker";

export const metadata = {
  title: "Vreedits",
  description: "AI workspace, productivity, and community — one platform.",
  applicationName: "Vreedits",
  appleWebApp: {
    capable: true,
    title: "Vreedits",
    statusBarStyle: "black",
  },
  formatDetection: { telephone: false },
  icons: { apple: "/icon-192.png" },
};

// Full-screen on phones: content may extend into the notch / home-bar areas
// (the bottom tab bar already pads for the home bar), and the status bar
// takes the app's dark purple.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#13051f",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Satoshi — UI/body font, served by Fontshare (Indian Type Foundry), not Google */}
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap"
        />
        {/* Dancing Script — cursive wordmark only, served by Bunny Fonts, not Google */}
        <link
          rel="stylesheet"
          href="https://fonts.bunny.net/css?family=dancing-script:600,700&display=swap"
        />
      </head>
      <body>
        <Tracker />
        {children}
      </body>
    </html>
  );
}