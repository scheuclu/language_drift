import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Nav } from "@/components/Nav";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

const instrument = Instrument_Serif({
    variable: "--font-instrument",
    subsets: ["latin"],
    weight: "400",
    style: ["normal", "italic"],
});

const TITLE = "WordDrift — watching English change, 2014–2025";
const DESCRIPTION =
    "Per-year Word2Vec embeddings trained on Common Crawl. Type a word and see how its neighbors shift over twelve years.";

export const metadata: Metadata = {
    // absolute base so the opengraph-image / twitter-image files resolve to
    // full URLs in shared link previews
    metadataBase: new URL("https://worddrift.xyz"),
    title: TITLE,
    description: DESCRIPTION,
    openGraph: {
        title: TITLE,
        description: DESCRIPTION,
        url: "https://worddrift.xyz",
        siteName: "WordDrift",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: TITLE,
        description: DESCRIPTION,
    },
};

export const viewport: Viewport = {
    themeColor: "#07080c",
    colorScheme: "dark",
    // draw under the notch / home indicator; pages opt in via .safe-pb where needed
    viewportFit: "cover",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="en"
            className={`${geistSans.variable} ${geistMono.variable} ${instrument.variable} h-full antialiased`}
            suppressHydrationWarning
        >
            {/* suppressHydrationWarning: browser extensions (ColorZilla, Grammarly, etc.)
          inject attributes like cz-shortcut-listen / contenteditable onto <html>/<body>
          before React hydrates, causing dev-only mismatch warnings. */}
            <body
                className="min-h-dvh flex flex-col bg-background text-foreground"
                suppressHydrationWarning
            >
                <Analytics />
                {/* filmic atmosphere over the whole site (non-interactive) */}
                <div className="fx-vignette" aria-hidden />
                <div className="fx-grain" aria-hidden />
                <Nav />
                {children}
            </body>
        </html>
    );
}
