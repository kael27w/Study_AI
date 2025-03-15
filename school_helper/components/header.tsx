"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { createClient } from "@/utils/supabase/client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import MainNav from "./main-nav"

export default function Header() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    getUser()
  }, [supabase.auth])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  // Function to handle logo click
  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault()
    // Always navigate to home when logo is clicked, regardless of auth state
    router.push("/")
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-8">
          <a href="#" onClick={handleLogoClick} className="flex items-center space-x-2">
            <span className="text-2xl font-bold text-[#6C5CE7]">StudyAI</span>
          </a>
          <MainNav />
        </div>
        <div className="flex items-center gap-4">
          {!loading && (
            user ? (
              <div className="flex items-center gap-4">
                <Link href="/dashboard">
                  <Button variant="outline" className="rounded-full border-[#6C5CE7] text-[#6C5CE7] hover:bg-[#6C5CE7]/10">
                    Dashboard
                  </Button>
                </Link>
                <Button 
                  variant="outline" 
                  className="rounded-full border-red-500 text-red-500 hover:bg-red-500/10"
                  onClick={handleSignOut}
                >
                  Sign out
                </Button>
              </div>
            ) : (
              <Link href="/sign-in">
                <Button className="rounded-full bg-[#6C5CE7] text-white hover:bg-[#6C5CE7]/90">
                  Log in
                </Button>
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  )
} 