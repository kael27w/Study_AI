"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface Document {
  id: string | number;
  name: string;
  created_at: string;
}

interface Activity {
  id: string | number;
  type: string;
  details: string;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push("/auth/login")
        return
      }
      
      setUser(user)
      
      // Load document history from localStorage
      try {
        // Retrieve recent uploads
        const recentUploads = getRecentUploads()
        setDocuments(recentUploads)
        
        // Retrieve recent activities
        const recentActivities = getRecentActivities()
        setActivities(recentActivities)
      } catch (error) {
        console.error("Error retrieving data from localStorage:", error)
      }
      
      setLoading(false)
    }
    
    getUser()
  }, [router, supabase.auth])

  // Function to retrieve recent uploads from localStorage
  const getRecentUploads = (): Document[] => {
    const uploads: Document[] = []
    
    // Try to get the most recent upload
    const lastDocName = localStorage.getItem('lastDocumentName')
    const lastUploadTime = localStorage.getItem('lastUploadTime')
    
    if (lastDocName && lastUploadTime) {
      uploads.push({
        id: 1,
        name: lastDocName,
        created_at: new Date(lastUploadTime).toLocaleString()
      })
    }
    
    // Add some sample documents if we don't have any
    if (uploads.length === 0) {
      uploads.push(
        { id: 1, name: "Study Notes.pdf", created_at: new Date().toLocaleString() },
        { id: 2, name: "Research Paper.pdf", created_at: new Date().toLocaleString() }
      )
    }
    
    return uploads
  }
  
  // Function to retrieve recent activities from localStorage
  const getRecentActivities = (): Activity[] => {
    const activities: Activity[] = []
    
    // Check for text activity
    const lastTextContent = localStorage.getItem('lastTextContent')
    const lastUploadTime = localStorage.getItem('lastUploadTime')
    
    if (lastTextContent && lastUploadTime) {
      activities.push({
        id: 1,
        type: "Text Analysis",
        details: `Analyzed text: "${lastTextContent}"`,
        created_at: new Date(lastUploadTime).toLocaleString()
      })
    }
    
    // Check for URL activity
    const lastUrlContent = localStorage.getItem('lastUrlContent')
    
    if (lastUrlContent && lastUploadTime) {
      activities.push({
        id: 2,
        type: "URL Analysis",
        details: `Processed content from: ${lastUrlContent}`,
        created_at: new Date(lastUploadTime).toLocaleString()
      })
    }
    
    return activities
  }

  return (
    <main className="container py-10">
      <h1 className="text-3xl font-bold mb-8">Your Dashboard</h1>
      
      {loading ? (
        <div className="flex justify-center">
          <p>Loading...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-white dark:bg-gray-800 shadow-md border-0">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-xl text-[#6C5CE7]">Recent Documents</CardTitle>
              <CardDescription>Your recently uploaded documents</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {documents.length > 0 ? (
                <ul className="space-y-3">
                  {documents.map((doc) => (
                    <li key={doc.id} className="p-3 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className="bg-[#6C5CE7]/10 p-2 rounded-md">
                          <svg className="h-5 w-5 text-[#6C5CE7]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{doc.name}</p>
                          <p className="text-sm text-muted-foreground">{doc.created_at}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-center py-6">No documents found.</p>
              )}
              <Button 
                className="mt-4 w-full bg-[#6C5CE7] text-white hover:bg-[#6C5CE7]/90"
                onClick={() => router.push("/upload")}
              >
                Upload New Document
              </Button>
            </CardContent>
          </Card>
          
          <Card className="bg-white dark:bg-gray-800 shadow-md border-0">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-xl text-[#6C5CE7]">Recent Activity</CardTitle>
              <CardDescription>Your recent interactions</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {activities.length > 0 ? (
                <ul className="space-y-3">
                  {activities.map((activity) => (
                    <li key={activity.id} className="p-3 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className="bg-green-100 p-2 rounded-md">
                          <svg className="h-5 w-5 text-green-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{activity.type}</p>
                          <p className="text-sm text-muted-foreground truncate max-w-[250px]">{activity.details}</p>
                          <p className="text-xs text-muted-foreground mt-1">{activity.created_at}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-center py-6">No recent activity.</p>
              )}
            </CardContent>
          </Card>
          
          <Card className="bg-white dark:bg-gray-800 shadow-md border-0">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-xl text-[#6C5CE7]">Account Summary</CardTitle>
              <CardDescription>Information about your account</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-blue-100 p-2 rounded-md">
                    <svg className="h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{user?.email}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="bg-purple-100 p-2 rounded-md">
                    <svg className="h-5 w-5 text-purple-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v12"/>
                      <path d="M16.5 7.5l-9 9"/>
                      <path d="M7.5 7.5l9 9"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Account Type</p>
                    <p className="font-medium">Free</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="bg-amber-100 p-2 rounded-md">
                    <svg className="h-5 w-5 text-amber-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Member Since</p>
                    <p className="font-medium">{new Date().toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mt-6">
                <Button
                  variant="outline"
                  className="w-full border-[#6C5CE7] text-[#6C5CE7] hover:bg-[#6C5CE7]/10"
                  onClick={() => router.push("/chat")}
                >
                  Go to Chat
                </Button>
                
                <Button
                  variant="outline"
                  className="w-full border-[#6C5CE7] text-[#6C5CE7] hover:bg-[#6C5CE7]/10"
                  onClick={() => router.push("/documents")}
                >
                  View Documents
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  )
} 