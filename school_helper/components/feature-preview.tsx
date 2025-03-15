import Image from "next/image"

export default function FeaturePreview() {
  return (
    <section className="py-16 bg-gray-50 dark:bg-gray-900/50">
      <div className="container">
        <div className="mx-auto max-w-2xl mb-12 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Powerful AI Study Tools at Your Fingertips
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Transform any document into interactive study materials in seconds
          </p>
        </div>
        <div className="border rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-lg mx-auto max-w-5xl">
          <div className="aspect-[16/9] w-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <svg
                className="h-20 w-20 text-gray-400 dark:text-gray-500 mb-4"
                fill="none"
                height="24"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.29 7 12 12 20.71 7" />
                <line x1="12" x2="12" y1="22" y2="12" />
              </svg>
              <h3 className="text-xl font-medium text-gray-700 dark:text-gray-300">Feature Preview Area</h3>
              <p className="mt-2 text-gray-500 dark:text-gray-400 max-w-md">
                This area will showcase how StudyAI transforms documents into interactive study materials.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
} 