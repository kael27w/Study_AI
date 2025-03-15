import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

export default function FaqSection() {
  return (
    <section className="py-16">
      <div className="container">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold mb-8 text-center">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="w-full space-y-2">
            <AccordionItem value="item-1">
              <AccordionTrigger className="text-left">What types of files can I upload?</AccordionTrigger>
              <AccordionContent>
                You can upload PDF documents, Word documents (.docx), text files (.txt), and various audio formats 
                including MP3, WAV, and M4A. We also support analyzing content from URLs for web articles, 
                YouTube videos, and more.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger className="text-left">How accurate are the AI-generated summaries?</AccordionTrigger>
              <AccordionContent>
                Our AI models are trained on diverse academic content and aim for high accuracy. However, we recommend 
                reviewing the generated content for your specific needs. The quality also depends on the clarity 
                and structure of the source material.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger className="text-left">Is my uploaded content secure?</AccordionTrigger>
              <AccordionContent>
                Yes, all uploaded content is encrypted and stored securely. We do not share your documents with 
                third parties, and you can delete your content at any time. We use industry-standard security 
                practices to protect your data.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger className="text-left">How long does it take to process a document?</AccordionTrigger>
              <AccordionContent>
                Processing time depends on the file size and type. Most text documents are processed within seconds, 
                while larger PDFs or audio files may take a few minutes. You'll receive a notification when your 
                document is ready.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-5">
              <AccordionTrigger className="text-left">Can I edit the generated content?</AccordionTrigger>
              <AccordionContent>
                Yes, you can edit summaries, notes, and flashcards generated from your documents. Our platform 
                is designed to be interactive, allowing you to customize the content to best fit your learning style.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </section>
  )
} 