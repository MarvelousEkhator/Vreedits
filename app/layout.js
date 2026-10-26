import "./globals.css";
import "../vreedits-layout.css";
import Tracker from "../components/Tracker";
import PwaSetup from "../components/PwaSetup";

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

// The opening screen when Vreedits is opened from the home screen: the logo in the middle, the name at the bottom.
// It is plain HTML, so it shows instantly (before the app has loaded) and PwaSetup fades it away.
const SPLASH_CSS = `
#vr-splash { display: none; }
@media (display-mode: standalone) {
  #vr-splash {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    position: fixed; inset: 0; z-index: 99999; background: #13051f;
    animation: vrSplashOut .45s ease 7s forwards;
  }
  #vr-splash.done { opacity: 0; visibility: hidden; transition: opacity .45s ease, visibility 0s linear .45s; }
  #vr-splash img { width: 112px; height: 112px; border-radius: 26px; box-shadow: 0 10px 40px rgba(124,58,237,.45); animation: vrSplashPop .7s cubic-bezier(.2,.9,.3,1.2) both; }
  #vr-splash .vr-name { position: absolute; bottom: calc(env(safe-area-inset-bottom, 0px) + 46px); font-family: 'Dancing Script', cursive; font-weight: 700; font-size: 30px; color: #e9d5ff; letter-spacing: .02em; animation: vrSplashFade .9s ease .25s both; }
}
@keyframes vrSplashPop { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: scale(1); } }
@keyframes vrSplashFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes vrSplashOut { to { opacity: 0; visibility: hidden; } }
`;

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
        <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
        <div id="vr-splash" aria-hidden="true">
          <img src="/icon-512.png" alt="" />
          <div className="vr-name">Vreedits</div>
        </div>
        <Tracker />
        {children}
        <PwaSetup />
      </body>
    </html>
  );
}