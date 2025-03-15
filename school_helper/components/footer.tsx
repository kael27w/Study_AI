import { ThemeSwitcher } from "@/components/theme-switcher"

export default function Footer() {
  return (
    <footer className="w-full border-t py-6 mt-auto">
      <div className="container flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} StudyAI. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <a href="#" className="hover:text-foreground">
            Privacy
          </a>
          <a href="#" className="hover:text-foreground">
            Terms
          </a>
          <ThemeSwitcher />
        </div>
      </div>
    </footer>
  )
} 