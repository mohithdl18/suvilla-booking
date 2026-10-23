import { Poppins, Ballet } from "next/font/google";
import "./globals.css";
// import WhatsAppButton from "@/components/WhatsAppButton.jsx";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const ballet = Ballet({
  variable: "--font-ballet",
  subsets: ["latin"],
  weight: "400",
});

export const metadata = {
  title: "SU VILLA | BY THE CREEK",
  description:
    "Experience a peaceful luxury stay surrounded by the lush green hills of Sakleshpur.",

  authors: [{ name: "Creo Creators" }],

  icons: {
    icon: "/images/logo.png",
  },

  openGraph: {
    title: "Your Website Title",
    description: "Your website description.",
    url: "https://yourdomain.com",
    siteName: "Your Website",
    images: [
      {
        url: "images/og-image.png",
        width: 1200,
        height: 630,
        alt: "Your Website",
      },
    ],
    locale: "en_IN",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "Your Website Title",
    description: "Your website description.",
    images: ["images/og-image.png"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${poppins.variable} ${ballet.variable}`}>
        {children}

        {/* <WhatsAppButton /> */}
        
      </body>
    </html>
  );
}