'use client';

import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import HeroSection from "@/components/hero-section"
import FeaturePreview from "@/components/feature-preview"
import FaqSection from "@/components/faq-section"

export default function Home() {
  const router = useRouter();

  return (
    <main className="flex-1">
      <HeroSection />
      <FeaturePreview />
      <FaqSection />
    </main>
  )
}
