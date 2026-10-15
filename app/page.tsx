"use client";

import dynamic from "next/dynamic";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import DepthMarquee from "@/components/DepthMarquee";
import ScentSection from "@/components/ScentSection";
import Quiz from "@/components/Quiz";
import { Story, RangeGrid, Proof, Cta, Footer } from "@/components/Sections";
import { useReveal } from "@/components/useReveal";
import { scents } from "@/lib/scents";

// The 3D scene only ever runs in the browser.
const SceneCanvas = dynamic(() => import("@/components/SceneCanvas"), { ssr: false });

export default function Home() {
  useReveal();

  return (
    <>
      <span id="top" />
      <SceneCanvas />
      <Header />
      <Hero />
      <DepthMarquee />
      <Story />
      <span id="fragrances" />
      {scents.map((s) => (
        <ScentSection key={s.slug} scent={s} />
      ))}
      <RangeGrid />
      <Proof />
      <Cta />
      <Footer />
      <Quiz />
    </>
  );
}
