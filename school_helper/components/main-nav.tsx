import Link from "next/link"
import { usePathname } from "next/navigation"

export default function MainNav() {
  const pathname = usePathname()

  return (
    <nav className="hidden md:flex items-center gap-6">
      <Link
        href="/upload"
        className={`text-sm transition-colors hover:text-primary ${
          pathname?.startsWith("/upload") ? "text-primary font-medium" : "text-muted-foreground"
        }`}
      >
        Upload
      </Link>
      <Link
        href="/documents"
        className={`text-sm transition-colors hover:text-primary ${
          pathname?.startsWith("/documents") ? "text-primary font-medium" : "text-muted-foreground"
        }`}
      >
        Documents
      </Link>
      <Link
        href="/chat"
        className={`text-sm transition-colors hover:text-primary ${
          pathname?.startsWith("/chat") ? "text-primary font-medium" : "text-muted-foreground"
        }`}
      >
        Chat
      </Link>
    </nav>
  )
} 