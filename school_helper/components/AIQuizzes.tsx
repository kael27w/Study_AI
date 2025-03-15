'use client';

import { useState, useEffect } from 'react';
import { Skeleton } from './ui/skeleton';
import { Button } from '@/components/ui/button';

interface QuizQuestion {
  question: string;
  options: string[];
  answer: string;
  explanation?: string;
}

interface AIQuizzesProps {
  documentId: string;
  documentName: string;
}

export function AIQuizzes({ documentId, documentName }: AIQuizzesProps) {
  const [quizzes, setQuizzes] = useState<QuizQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealedAnswers, setRevealedAnswers] = useState<{[key: number]: boolean}>({});
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const MAX_RETRIES = 3;

  useEffect(() => {
    if (!documentId) {
      setIsLoading(false);
      setError('No document selected');
      return;
    }

    const fetchQuizzes = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        console.log('🔍 [AI QUIZZES] Fetching quizzes for document:', documentId);
        
        // Add a timestamp to prevent caching issues
        const timestamp = Date.now();
        
        const response = await fetch('/api/document-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            documentId,
            message: 'Generate 5 multiple choice quiz questions based on this document. For each question, provide 4 options and indicate the correct answer. Format your response as valid JSON that can be parsed by JavaScript.',
            context: documentName,
            type: 'quizzes',
            timestamp
          }),
        });

        const data = await response.json();
        
        if (!response.ok) {
          console.error('🔍 [AI QUIZZES] API error response:', data);
          throw new Error(data.error || `Failed to fetch quizzes (Status ${response.status})`);
        }

        console.log('🔍 [AI QUIZZES] Quizzes fetched successfully');
        
        if (data.status === 'failed' || data.error) {
          console.error('🔍 [AI QUIZZES] API returned error status:', data);
          throw new Error(data.error || 'Failed to generate quizzes');
        }
        
        if (!data.response || data.response.trim() === '') {
          throw new Error('No quiz content received from API');
        }
        
        // Log the full response for debugging
        console.log('🔍 [AI QUIZZES] Full response:', data.response);
        
        // Try to parse the response as a JSON array of quiz questions
        try {
          // First attempt: Try direct JSON parsing
          try {
            const directParse = JSON.parse(data.response);
            if (Array.isArray(directParse) && directParse.length > 0) {
              console.log('🔍 [AI QUIZZES] Successfully parsed JSON directly');
              setQuizzes(directParse);
              return;
            }
          } catch (directError) {
            console.log('🔍 [AI QUIZZES] Direct JSON parsing failed, trying alternative methods');
          }
          
          // Second attempt: Find a JSON array in the response
          const jsonMatch = data.response.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (jsonMatch) {
            console.log('🔍 [AI QUIZZES] Found JSON array in response');
            
            // Clean up any potential JSON issues
            let cleanedJson = jsonMatch[0]
              // Fix trailing commas
              .replace(/,\s*}/g, '}')
              .replace(/,\s*\]/g, ']')
              // Fix escaped quotes
              .replace(/\\'/g, "'")
              .replace(/\\"/g, '"')
              // Fix spacing around colons
              .replace(/(['"])\s*:\s*(['"])/g, '$1: $2');
            
            // Fix missing quotes around property names
            cleanedJson = cleanedJson.replace(/(\{|\,)\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
            
            // Fix unquoted property values that aren't numbers
            cleanedJson = cleanedJson.replace(/:\s*([a-zA-Z][a-zA-Z0-9_]*)\s*(,|\})/g, ':"$1"$2');
            
            // Fix arrays with unquoted strings
            cleanedJson = cleanedJson.replace(/\[\s*([a-zA-Z][a-zA-Z0-9_\s]*)(,|\])/g, '["$1"$2');
            cleanedJson = cleanedJson.replace(/,\s*([a-zA-Z][a-zA-Z0-9_\s]*)(,|\])/g, ',"$1"$2');
            
            console.log('🔍 [AI QUIZZES] Cleaned JSON:', cleanedJson);
            
            try {
              const parsedQuizzes = JSON.parse(cleanedJson);
              console.log('🔍 [AI QUIZZES] Successfully parsed JSON after cleaning');
              
              // Validate the parsed data
              if (Array.isArray(parsedQuizzes) && parsedQuizzes.length > 0) {
                // Ensure each quiz has the required properties
                const validQuizzes = parsedQuizzes.filter(quiz => 
                  quiz && 
                  typeof quiz.question === 'string' && 
                  Array.isArray(quiz.options) && 
                  typeof quiz.answer === 'string'
                );
                
                if (validQuizzes.length > 0) {
                  setQuizzes(validQuizzes);
                  return;
                } else {
                  console.error('🔍 [AI QUIZZES] Parsed JSON did not contain valid quiz questions');
                  throw new Error('Parsed JSON did not contain valid quiz questions');
                }
              } else {
                console.error('🔍 [AI QUIZZES] Parsed JSON is not an array or is empty');
                throw new Error('Parsed JSON is not an array or is empty');
              }
            } catch (jsonError) {
              console.error('🔍 [AI QUIZZES] JSON parse error after cleaning:', jsonError);
              // Continue to fallback parsing
            }
          }
          
          // Third attempt: Manual parsing as a last resort
          console.log('🔍 [AI QUIZZES] Attempting manual parsing');
          
          // Try to find question blocks
          const questionBlocks = data.response.split(/Question \d+:|^\d+\./m).filter(Boolean);
          
          if (questionBlocks.length === 0) {
            // Try another pattern
            const altBlocks = data.response.split(/\n\s*\d+[\.\)]/g).filter(Boolean);
            if (altBlocks.length > 0) {
              console.log('🔍 [AI QUIZZES] Found alternative question blocks:', altBlocks.length);
              const parsedQuizzes = parseQuestionBlocks(altBlocks);
              if (parsedQuizzes.length > 0) {
                setQuizzes(parsedQuizzes);
                return;
              }
            }
            throw new Error('Could not parse quiz questions from response');
          }
          
          const parsedQuizzes = parseQuestionBlocks(questionBlocks);
          
          if (parsedQuizzes.length === 0) {
            throw new Error('No quiz questions could be parsed from the response');
          }
          
          setQuizzes(parsedQuizzes);
        } catch (parseError) {
          console.error('🔍 [AI QUIZZES] Error parsing quizzes:', parseError);
          
          // If we haven't reached max retries, try again
          if (retryCount < MAX_RETRIES) {
            console.log(`🔍 [AI QUIZZES] Retrying (${retryCount + 1}/${MAX_RETRIES})...`);
            setRetryCount(prev => prev + 1);
            setIsRetrying(true);
            // Wait a bit before retrying
            setTimeout(() => fetchQuizzes(), 1500);
            return;
          }
          
          throw new Error(parseError instanceof Error ? 
            `Error parsing quiz questions: ${parseError.message}` : 
            'Failed to parse quiz questions. Please try again.');
        }
      } catch (err) {
        console.error('🔍 [AI QUIZZES] Error fetching quizzes:', err);
        setError(err instanceof Error ? err.message : 'Failed to load quizzes. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    
    // Helper function to parse question blocks
    const parseQuestionBlocks = (blocks: string[]): QuizQuestion[] => {
      return blocks.map((block: string) => {
        // Extract question
        let question = block.split('\n')[0].trim();
        if (!question) {
          // Try to find the first non-empty line
          const lines = block.split('\n').filter(line => line.trim().length > 0);
          if (lines.length > 0) {
            question = lines[0].trim();
          } else {
            question = "Question not found";
          }
        }
        
        // Extract options
        const options: string[] = [];
        
        // Try different option patterns
        const optionPatterns = [
          /([A-D])[\.|\)]\s*(.*?)(?=(?:[A-D][\.|\)]|Answer:|Correct Answer:|$))/g,
          /Option\s+([A-D])[\.|\:|\)]\s*(.*?)(?=(?:Option\s+[A-D]|Answer:|Correct Answer:|$))/g,
          /([A-D])\.\s*(.*?)(?=(?:[A-D]\.|Answer:|Correct Answer:|$))/g
        ];
        
        for (const pattern of optionPatterns) {
          let match;
          let foundOptions = false;
          
          while ((match = pattern.exec(block)) !== null) {
            options.push(match[2].trim());
            foundOptions = true;
          }
          
          if (foundOptions) break;
        }
        
        // If no options found, try to extract them from lines
        if (options.length === 0) {
          const lines = block.split('\n');
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            const optionMatch = line.match(/^([A-D])[\.|\)|\:]\s*(.+)$/);
            if (optionMatch) {
              options.push(optionMatch[2].trim());
            }
          }
        }
        
        // Ensure we have 4 options
        while (options.length < 4) {
          options.push(`Option ${options.length + 1}`);
        }
        
        // Extract answer
        let answer = '';
        const answerPatterns = [
          /Answer:\s*([A-D])/i,
          /Correct Answer:\s*([A-D])/i,
          /Correct Answer:\s*Option\s*([A-D])/i,
          /Answer:\s*Option\s*([A-D])/i,
          /Answer:\s*"?([^"]+)"?/i,
          /Correct Answer:\s*"?([^"]+)"?/i
        ];
        
        for (const pattern of answerPatterns) {
          const answerMatch = block.match(pattern);
          if (answerMatch) {
            // Check if it's a letter (A, B, C, D)
            if (/^[A-D]$/i.test(answerMatch[1])) {
              const index = answerMatch[1].toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
              if (index >= 0 && index < options.length) {
                answer = options[index];
                break;
              }
            } else {
              // It's the actual answer text
              answer = answerMatch[1].trim();
              break;
            }
          }
        }
        
        // If no answer found, use the first option
        if (!answer && options.length > 0) {
          answer = options[0];
        }
        
        // Extract explanation
        let explanation: string | undefined;
        const explanationPatterns = [
          /Explanation:\s*(.*?)(?=(?:Question|$))/,
          /Explanation:\s*([\s\S]*)/,
          /Reason:\s*(.*?)(?=(?:Question|$))/
        ];
        
        for (const pattern of explanationPatterns) {
          const explanationMatch = block.match(pattern);
          if (explanationMatch) {
            explanation = explanationMatch[1].trim();
            break;
          }
        }
        
        return { question, options, answer, explanation };
      }).filter(quiz => quiz.question !== "Question not found" && quiz.options.length > 0);
    };

    fetchQuizzes();
  }, [documentId, documentName, retryCount]);

  // Add a retry button function
  const handleRetry = () => {
    setError(null);
    setRetryCount(0);
    setIsLoading(true);
    // This will trigger the useEffect to run again
  };

  const toggleAnswer = (index: number) => {
    setRevealedAnswers(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  if (isLoading) {
    return (
      <div className="space-y-8 p-4">
        {isRetrying && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-blue-700 flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Retrying... (Attempt {retryCount}/{MAX_RETRIES})
            </p>
            <p className="text-sm text-blue-600 mt-1">
              The AI sometimes needs multiple attempts to format quiz questions correctly.
            </p>
          </div>
        )}
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <h3 className="text-lg font-medium text-red-700 mb-2">Error Loading Quizzes</h3>
        <p className="text-red-600">{error}</p>
        <p className="mt-2 text-sm text-red-500">
          This is usually caused by the AI generating quiz questions in an incorrect format. 
          Try refreshing the page or clicking the button below to retry.
        </p>
        <div className="mt-4 flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRetry}
          >
            Try Again
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.location.reload()}
          >
            Refresh Page
          </Button>
        </div>
      </div>
    );
  }

  if (quizzes.length === 0) {
    return (
      <div className="p-4">
        <p>No quiz questions available for this document.</p>
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleRetry}
          className="mt-3"
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-8">
      <h2 className="text-xl font-bold mb-4">AI Quizzes for {documentName}</h2>
      
      {quizzes.map((quiz, index) => (
        <div key={index} className="border rounded-lg p-4 shadow-sm">
          <h3 className="font-medium mb-2">Question {index + 1}: {quiz.question}</h3>
          
          <div className="space-y-2 ml-4 mb-4">
            {quiz.options && quiz.options.length > 0 ? (
              quiz.options.map((option, optIndex) => (
                <div key={optIndex} className="flex items-start gap-2">
                  <div className="flex-shrink-0 w-5 h-5 mt-0.5">
                    <input 
                      type="radio" 
                      name={`question-${index}`} 
                      id={`question-${index}-option-${optIndex}`}
                      className="w-4 h-4"
                    />
                  </div>
                  <label 
                    htmlFor={`question-${index}-option-${optIndex}`}
                    className="text-sm"
                  >
                    {option}
                  </label>
                </div>
              ))
            ) : (
              <p className="text-red-500">No options available for this question</p>
            )}
          </div>
          
          <div className="mt-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => toggleAnswer(index)}
            >
              {revealedAnswers[index] ? 'Hide Answer' : 'Show Answer'}
            </Button>
            
            {revealedAnswers[index] && (
              <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-900">
                <p className="font-medium text-green-800 dark:text-green-300">
                  Correct answer: {quiz.answer}
                </p>
                {quiz.explanation && (
                  <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                    {quiz.explanation}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
} 