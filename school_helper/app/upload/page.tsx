import UploadPanel from "@/components/upload-panel"

export const metadata = {
  title: "Upload - StudyAI",
  description: "Upload your documents, text, audio, or links for AI-powered analysis",
}

export default function UploadPage() {
  return (
    <main className="flex-1 py-12">
      <div className="container">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold mb-2">Upload Your Study Material</h1>
          <p className="text-muted-foreground">
            Upload any content and get instant summaries, notes, quizzes, and AI-powered insights
          </p>
        </div>
        <UploadPanel />
      </div>
    </main>
  )
} 