import "./globals.css";
import Tracker from "../components/Tracker";

export const metadata = {
  title: "Vreedits",
  description: "AI workspace, productivity, and community — one platform.",
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