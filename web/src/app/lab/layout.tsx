import type { Metadata } from "next";
import { Archivo, Martian_Mono } from "next/font/google";
import "./lab.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });
const martian = Martian_Mono({ subsets: ["latin"], axes: ["wdth"], variable: "--font-martian" });

export const metadata: Metadata = {
  title: "Hookdash Lab — every event, in flight",
  description: "Design prototype: Hookdash as an observable event gateway.",
  robots: { index: false, follow: false },
};

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${archivo.variable} ${martian.variable} lab-fonts`}>{children}</div>;
}
