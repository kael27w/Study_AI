"use client"

import { useState, useRef } from "react"
import { FileText, Mic, LinkIcon, Upload, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRouter } from "next/navigation"
import { FileUpload } from "@/components/FileUpload"
import { toast } from "sonner"
import { createClient } from "@/utils/supabase/client"
import { v4 as uuidv4 } from 'uuid'

export default function UploadPanel() {
  const router = useRouter()
  const [isUploading, setIsUploading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [url, setUrl] = useState("")
  const [textContent, setTextContent] = useState("")
  
  // Audio recording states
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const handleUploadSuccess = (fileUrl: string, documentId: string) => {
    // Add document processing notification
    toast.success("Document uploaded successfully!", {
      description: "Redirecting to chat...",
      duration: 3000,
    })
    
    // Clear any previous document IDs from localStorage
    localStorage.removeItem('documentId')
    localStorage.removeItem('documentName')
    localStorage.removeItem('lastUploadTime')
    
    // Save the document ID to localStorage with current timestamp to ensure freshness
    const timestamp = Date.now()
    localStorage.setItem('documentId', documentId)
    localStorage.setItem('documentName', fileUrl || 'Uploaded Document')
    localStorage.setItem('lastUploadTime', timestamp.toString())
    
    // Simulate processing time
    setTimeout(() => {
      // Redirect to chat page after successful upload
      router.push(`/chat?documentId=${documentId}&documentName=${encodeURIComponent(fileUrl || 'Uploaded Document')}&timestamp=${timestamp}`)
    }, 1500)
  }

  const handleTextSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!textContent.trim()) {
      toast.error("Please enter some text to analyze")
      return
    }

    setIsUploading(true)
    
    try {
      const supabase = createClient()
      
      // Check authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        toast.error('You must be logged in to upload text')
        setIsUploading(false)
        return
      }
      
      // Generate a unique ID for this text document
      const documentName = `Text Document ${new Date().toLocaleString().replace(/[/:\\]/g, '-')}`
      const fileName = `${Date.now()}_${documentName.replace(/\s+/g, '_')}.txt`
      const filePath = `public/${fileName}`
      
      // Upload the text as a file
      const { data, error } = await supabase.storage
        .from('Documents')
        .upload(filePath, new Blob([textContent], { type: 'text/plain' }), {
          cacheControl: '3600',
          upsert: true
        })
      
      if (error) {
        console.error('Text upload error:', error)
        throw new Error(`Upload failed: ${error.message}`)
      }
      
      // Insert document record
      const { data: docData, error: docError } = await supabase
        .from('Documents')
        .insert({
          user_id: user.id,
          original_name: documentName,
          file_url: filePath
        })
        .select()
      
      if (docError) {
        console.error('Error inserting text document:', docError)
        throw new Error(`Failed to save text document: ${docError.message}`)
      }
      
      const documentId = docData[0].id
      
      toast.success("Text uploaded successfully!", {
        description: "Processing your text content...",
        duration: 3000,
      })
      
      // Clear any previous document IDs from localStorage
      localStorage.removeItem('documentId')
      localStorage.removeItem('documentName')
      localStorage.removeItem('lastUploadTime')
      localStorage.removeItem('lastTextContent')
      
      // Save document info to localStorage with current timestamp to ensure freshness
      const timestamp = Date.now()
      localStorage.setItem('documentId', documentId)
      localStorage.setItem('documentName', documentName)
      localStorage.setItem('lastUploadTime', timestamp.toString())
      localStorage.setItem('lastTextContent', textContent.substring(0, 100) + '...')
      
      await new Promise(resolve => setTimeout(resolve, 1500))
      router.push(`/chat?documentId=${documentId}&documentName=${encodeURIComponent(documentName)}&timestamp=${timestamp}`)
    } catch (error) {
      console.error("Error processing text:", error)
      toast.error("Error processing text. Please try again.")
    } finally {
      setIsUploading(false)
    }
  }

  const handleUrlSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!url.trim()) {
      toast.error("Please enter a valid URL")
      return
    }

    setIsUploading(true)
    
    try {
      // Validate URL format
      try {
        new URL(url)
      } catch (e) {
        toast.error("Please enter a valid URL format (e.g., https://example.com)")
        setIsUploading(false)
        return
      }
      
      const supabase = createClient()
      
      // Check authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        toast.error('You must be logged in to upload URLs')
        setIsUploading(false)
        return
      }
      
      // Generate document name from URL
      const documentName = url.split('/').pop() || 'Web Content'
      
      // Insert document record
      const { data: docData, error: docError } = await supabase
        .from('Documents')
        .insert({
          user_id: user.id,
          original_name: documentName,
          file_url: url
        })
        .select()
      
      if (docError) {
        console.error('Error inserting URL document:', docError)
        throw new Error(`Failed to save URL document: ${docError.message}`)
      }
      
      const documentId = docData[0].id
      
      // Clear any previous document IDs from localStorage
      localStorage.removeItem('documentId')
      localStorage.removeItem('documentName')
      localStorage.removeItem('lastUploadTime')
      localStorage.removeItem('lastUrlContent')
      
      // Save document info to localStorage with current timestamp to ensure freshness
      const timestamp = Date.now()
      localStorage.setItem('documentId', documentId)
      localStorage.setItem('documentName', documentName)
      localStorage.setItem('lastUploadTime', timestamp.toString())
      localStorage.setItem('lastUrlContent', url)
      
      toast.success("URL submitted successfully!", {
        description: "Extracting content from URL...",
        duration: 3000,
      })
      
      await new Promise(resolve => setTimeout(resolve, 2000))
      router.push(`/chat?documentId=${documentId}&documentName=${encodeURIComponent(documentName)}&timestamp=${timestamp}`)
    } catch (error) {
      console.error("Error processing URL:", error)
      toast.error("Error processing URL. Please try again.")
    } finally {
      setIsUploading(false)
    }
  }

  const startRecording = async () => {
    setIsRecording(true)
    chunksRef.current = [];
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/wav' });
        setAudioBlob(audioBlob);
        
        // Process the recorded audio
        processAudioRecording(audioBlob);
        
        // Stop all tracks from the stream
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current.start();
      
      toast.success("Recording started", {
        description: "Speak clearly into your microphone"
      });
    } catch (err) {
      console.error("Error accessing microphone:", err);
      toast.error("Could not access microphone. Please ensure microphone permissions are granted.");
      setIsRecording(false);
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast.success("Recording stopped", {
        description: "Processing your audio..."
      });
    }
  };
  
  const processAudioRecording = async (blob: Blob) => {
    try {
      const supabase = createClient()
      
      // Check authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        toast.error('You must be logged in to upload audio')
        return
      }
      
      // Generate a unique name for this audio recording
      const documentName = `Audio Recording ${new Date().toLocaleString().replace(/[/:\\]/g, '-')}`
      const fileName = `audio_part_${Date.now()}.mp3`
      const filePath = `public/${Date.now()}_${fileName}`
      
      // Upload the audio blob
      const { data, error } = await supabase.storage
        .from('Documents')
        .upload(filePath, blob, {
          cacheControl: '3600',
          upsert: true
        })
      
      if (error) {
        console.error('Audio upload error:', error)
        throw new Error(`Upload failed: ${error.message}`)
      }
      
      // Insert document record
      const { data: docData, error: docError } = await supabase
        .from('Documents')
        .insert({
          user_id: user.id,
          original_name: documentName,
          file_url: filePath
        })
        .select()
      
      if (docError) {
        console.error('Error inserting audio document:', docError)
        throw new Error(`Failed to save audio document: ${docError.message}`)
      }
      
      const initialDocumentId = docData[0].id
      
      // Clear any previous document IDs from localStorage
      localStorage.removeItem('documentId')
      localStorage.removeItem('documentName')
      localStorage.removeItem('lastUploadTime')
      localStorage.removeItem('audioDocumentId')
      
      // Save document info to localStorage with current timestamp to ensure freshness
      const timestamp = Date.now()
      localStorage.setItem('documentId', initialDocumentId)
      localStorage.setItem('documentName', documentName)
      localStorage.setItem('lastUploadTime', timestamp.toString())
      
      toast.success("Audio processing started!", {
        description: "This may take a few moments...",
        duration: 5000,
      })
      
      // Add a timestamp parameter to ensure fresh requests
      const apiTimestamp = Date.now()
      
      // Process the audio file
      const response = await fetch(`/api/process-audio-file?t=${apiTimestamp}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        },
        body: JSON.stringify({ 
          filePath, 
          fileName,
          timestamp: apiTimestamp // Include timestamp in the body too
        }),
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error("Error processing audio file:", response.status, errorText)
        throw new Error(`Failed to process audio file: ${response.status}`)
      }
      
      // Parse the response
      const result = await response.json()
      console.log("Audio processing result:", result)
      
      if (result.success || result.status === 'completed') {
        toast.success("Audio processing complete!", {
          description: "Your audio has been transcribed successfully.",
          duration: 5000,
        })
        
        // Use the document ID returned from the API if available
        const finalDocumentId = result.documentId || initialDocumentId
        console.log("Using document ID:", finalDocumentId)
        
        // Update localStorage with the final document ID
        localStorage.setItem('documentId', finalDocumentId)
        
        // Redirect to chat page
        router.push(`/chat?documentId=${finalDocumentId}&documentName=${encodeURIComponent(documentName)}&timestamp=${timestamp}`)
      } else {
        console.error("Audio processing failed:", result.error || "Unknown error")
        toast.error("Audio processing failed. Please try again.")
        
        // Still redirect to chat page with the original document ID
        router.push(`/chat?documentId=${initialDocumentId}&documentName=${encodeURIComponent(documentName)}&timestamp=${timestamp}`)
      }
    } catch (error) {
      console.error("Error processing audio:", error)
      toast.error(error instanceof Error ? error.message : "Error processing audio. Please try again.")
    }
  }
  
  const handleAudioProcess = async (file: File) => {
    try {
      const supabase = createClient()
      
      // Check authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        toast.error('You must be logged in to upload audio')
        return
      }
      
      // Generate a unique name for this audio file
      const documentName = `Audio File ${file.name}`
      const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`
      const filePath = `public/${fileName}`
      
      // Upload the audio file
      const { data, error } = await supabase.storage
        .from('Documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        })
      
      if (error) {
        console.error('Audio upload error:', error)
        throw new Error(`Upload failed: ${error.message}`)
      }
      
      // Insert document record
      const { data: docData, error: docError } = await supabase
        .from('Documents')
        .insert({
          user_id: user.id,
          original_name: documentName,
          file_url: filePath
        })
        .select()
      
      if (docError) {
        console.error('Error inserting audio document:', docError)
        throw new Error(`Failed to save audio document: ${docError.message}`)
      }
      
      const documentId = docData[0].id
      
      // Clear any previous document IDs from localStorage
      localStorage.removeItem('documentId')
      localStorage.removeItem('documentName')
      localStorage.removeItem('lastUploadTime')
      localStorage.removeItem('audioDocumentId')
      
      // Save document info to localStorage with current timestamp to ensure freshness
      const timestamp = Date.now()
      localStorage.setItem('documentId', documentId)
      localStorage.setItem('documentName', documentName)
      localStorage.setItem('lastUploadTime', timestamp.toString())
      
      toast.success("Audio file uploaded!", {
        description: "Processing your audio file...",
        duration: 3000,
      })
      
      // Add a timestamp parameter to ensure fresh requests
      const apiTimestamp = Date.now()
      
      // Process the audio file
      const response = await fetch(`/api/process-audio-file?t=${apiTimestamp}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        },
        body: JSON.stringify({ 
          filePath, 
          fileName,
          timestamp: apiTimestamp
        }),
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error("Error processing audio file:", response.status, errorText)
        throw new Error(`Failed to process audio file: ${response.status}`)
      }
      
      // Parse the response
      const result = await response.json()
      console.log("Audio processing result:", result)
      
      if (result.success || result.status === 'completed') {
        toast.success("Audio processing complete!", {
          description: "Your audio has been transcribed successfully.",
          duration: 5000,
        })
        
        // Use the document ID returned from the API if available
        const finalDocumentId = result.documentId || documentId
        console.log("Using document ID:", finalDocumentId)
        
        // Update localStorage with the final document ID
        localStorage.setItem('documentId', finalDocumentId)
        
        // Redirect to chat page
        router.push(`/chat?documentId=${finalDocumentId}&documentName=${encodeURIComponent(documentName)}&timestamp=${timestamp}`)
      } else {
        console.error("Audio processing failed:", result.error || "Unknown error")
        toast.error("Audio processing failed. Please try again.")
        
        // Still redirect to chat page with the original document ID
        router.push(`/chat?documentId=${documentId}&documentName=${encodeURIComponent(documentName)}&timestamp=${timestamp}`)
      }
    } catch (error) {
      console.error("Error processing audio file:", error)
      toast.error(error instanceof Error ? error.message : "Error processing audio file. Please try again.")
    }
  }

  return (
    <Card className="w-full max-w-3xl mx-auto shadow-lg">
      <CardContent className="p-6">
        <Tabs defaultValue="file" className="w-full">
          <TabsList className="grid grid-cols-4 mb-6">
            <TabsTrigger value="file" className="flex flex-col items-center gap-2 py-3">
              <FileText className="h-5 w-5" />
              <span className="text-xs">Document</span>
            </TabsTrigger>
            <TabsTrigger value="text" className="flex flex-col items-center gap-2 py-3">
              <FileText className="h-5 w-5" />
              <span className="text-xs">Text</span>
            </TabsTrigger>
            <TabsTrigger value="audio" className="flex flex-col items-center gap-2 py-3">
              <Mic className="h-5 w-5" />
              <span className="text-xs">Audio</span>
            </TabsTrigger>
            <TabsTrigger value="link" className="flex flex-col items-center gap-2 py-3">
              <LinkIcon className="h-5 w-5" />
              <span className="text-xs">Link</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="mt-0">
            <div className="border-2 border-dashed rounded-lg p-8">
              <FileUpload 
                onUploadSuccess={handleUploadSuccess}
                acceptedFileTypes={['.pdf', '.txt', '.doc', '.docx', '.mp3', '.wav', '.m4a']}
              />
            </div>
          </TabsContent>

          <TabsContent value="text" className="mt-0">
            <form onSubmit={handleTextSubmit} className="space-y-4">
              <textarea
                id="text-content"
                className="w-full h-40 p-3 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Paste or type your text here..."
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
              ></textarea>
              <Button 
                className="w-full bg-[#6C5CE7] text-white hover:bg-[#6C5CE7]/90" 
                type="submit"
                disabled={isUploading}
              >
                {isUploading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⏳</span> Processing...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Upload className="h-4 w-4" /> Process Text
                  </span>
                )}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="audio" className="mt-0">
            <div className="space-y-6">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <div className="mb-6">
                  <h3 className="text-lg font-medium mb-2">Record Audio</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Record your voice directly from your microphone
                  </p>
                  
                  {isRecording ? (
                    <div className="space-y-4">
                      <div className="flex justify-center">
                        <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                          <Mic className="h-8 w-8 text-white" />
                        </div>
                      </div>
                      <p className="text-red-500 font-medium">Recording...</p>
                      <Button 
                        onClick={stopRecording}
                        className="bg-red-500 hover:bg-red-600 text-white"
                      >
                        Stop Recording
                      </Button>
                    </div>
                  ) : (
                    <Button 
                      onClick={startRecording}
                      className="bg-[#6C5CE7] hover:bg-[#6C5CE7]/90 text-white"
                    >
                      <Mic className="h-4 w-4 mr-2" /> Start Recording
                    </Button>
                  )}
                </div>
                
                <div className="border-t pt-6">
                  <h3 className="text-lg font-medium mb-2">Upload Audio File</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Upload an existing audio file (.mp3, .wav, .m4a)
                  </p>
                  
                  <FileUpload 
                    onUploadSuccess={handleUploadSuccess}
                    acceptedFileTypes={['.mp3', '.wav', '.m4a']}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="link" className="mt-0">
            <form onSubmit={handleUrlSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="url">Enter URL</Label>
                <Input
                  id="url"
                  placeholder="https://example.com/article"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>
              <Button 
                className="w-full bg-[#6C5CE7] text-white hover:bg-[#6C5CE7]/90" 
                type="submit"
                disabled={isUploading}
              >
                {isUploading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⏳</span> Processing...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4" /> Process URL
                  </span>
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
} 