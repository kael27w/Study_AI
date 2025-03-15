import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import Link from "next/link"

export default function HeroSection() {
  return (
    <section className="relative">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <svg
          className="absolute left-[calc(50%-18rem)] top-[-5rem] h-[42rem] w-[82rem] -translate-x-1/2 stroke-gray-200 [mask-image:radial-gradient(32rem_32rem_at_center,white,transparent)] sm:top-[-9rem]"
          aria-hidden="true"
        >
          <defs>
            <pattern id="wave" width={200} height={200} patternUnits="userSpaceOnUse">
              <path d="M.5 200V.5H200" fill="none" className="text-gray-50" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" strokeWidth={0} fill="url(#wave)" />
          <svg x="50%" y="0" className="overflow-visible fill-gray-50">
            <path d="M-200 0h201v201h-201Z M600 0h201v201h-201Z" strokeWidth={0} />
          </svg>
        </svg>
      </div>

      <div className="container relative">
        <div className="mx-auto max-w-4xl pt-20 pb-16 text-center">
          <h1 className="text-5xl font-bold tracking-tight sm:text-7xl">
            Transform Your Learning with{" "}
            <span className="bg-gradient-to-r from-[#6C5CE7] to-[#a29bfe] bg-clip-text text-transparent">
              AI-Powered Study Tools
            </span>
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Upload any content—text, PDFs, audio, or links—and get instant summaries, notes, quizzes, and AI-powered
            insights.
          </p>
          <div className="mt-10 flex items-center justify-center gap-6">
            <Link href="/upload">
              <Button size="lg" className="bg-[#6C5CE7] text-white hover:bg-[#6C5CE7]/90">
                Start Learning
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
} 