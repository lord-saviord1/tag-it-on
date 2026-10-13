"use client";

import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import ScentSection from "@/components/ScentSection";
import { Story, RangeGrid, Proof, Cta, Footer } from "@/components/Sections";
import { useReveal } from "@/components/useReveal";
import { scents } from "@/lib/scents";

export default function Home() {
  useReveal();

  return (
    <>
      <Header />
      <Hero />
      <Marquee />
      <Story />
      {scents.map((s, i) => (
        <ScentSection key={s.slug} scent={s} id={i === 0 ? "fragrances" : undefined} />
      ))}
      <RangeGrid />
      <Proof />
      <Cta />
      <Footer />
    </>
  );
}
