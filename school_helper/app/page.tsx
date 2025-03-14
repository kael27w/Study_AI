import Hero from "@/components/hero";
import ConnectSupabaseSteps from "@/components/tutorial/connect-supabase-steps";
import SignUpUserSteps from "@/components/tutorial/sign-up-user-steps";
import { hasEnvVars } from "@/utils/supabase/check-env-vars";
import Link from "next/link";

export default async function Home() {
  return (
    <>
      <Hero />
      <main className="flex-1 flex flex-col gap-6 px-4">
        <h2 className="font-medium text-xl mb-4">Next steps</h2>
        {hasEnvVars ? <SignUpUserSteps /> : <ConnectSupabaseSteps />}
        
        <div className="flex flex-col gap-2">
          <Link href="/documents" className="hover:underline text-blue-600">
            Your Documents
          </Link>
          <Link href="/chat" className="hover:underline text-blue-600">
            Document Chat
          </Link>
          <Link href="/upload" className="hover:underline text-blue-600 font-medium">
            Upload New Document
          </Link>
        </div>
        
        <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium mb-2">Try Our Document Chat</h3>
          <p className="text-gray-600 mb-4">
            Upload a PDF document and chat with it using our AI assistant. Get answers and insights from your documents instantly.
          </p>
          <div className="flex gap-3">
            <Link 
              href="/upload" 
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Upload Document
            </Link>
            <Link 
              href="/chat" 
              className="inline-block px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
            >
              Go to Chat
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
