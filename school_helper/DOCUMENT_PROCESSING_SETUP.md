# Document Processing Setup Guide

This guide explains how to set up document processing with PDFs using Next.js, Supabase, and OpenAI embeddings.

## High-Level Overview

We've created a system that:
1. Reads PDF files from Supabase storage
2. Processes them using Langchain
3. Creates embeddings using OpenAI
4. Stores the embeddings in a vector store for later retrieval

## Prerequisites

- Node.js installed
- Supabase account and project
- OpenAI API key
- PDF files uploaded to Supabase storage

## Installation Steps

1. Install required dependencies:
```bash
npm install @langchain/openai @langchain/community langchain @langchain/document-loaders-pdf pdf-parse
```

2. Set up environment variables in `.env.local`:
```bash
# Supabase credentials
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# OpenAI API key
OPENAI_API_KEY=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
```

## File Structure

```
school_helper/
├── app/
│   ├── api/
│   │   └── process-documents/
│   │       └── route.ts
│   └── services/
│       └── documentProcessor.ts
├── .env.local
└── SUPABASE_SETUP.md
```

## Key Components

### 1. Document Processor (`documentProcessor.ts`)

This service handles:
- Reading files from Supabase storage
- Processing PDFs using Langchain
- Creating embeddings with OpenAI
- Storing vectors in memory

Key features:
- PDF loading and chunking
- Text splitting with overlap
- Embedding generation
- Vector store creation

### 2. API Route (`route.ts`)

Handles HTTP requests to process documents:
- GET endpoint for processing
- Error handling
- Environment variable validation

## Usage

1. Upload PDFs to your Supabase 'Documents' bucket

2. Process documents via API:
```bash
curl -v http://localhost:3001/api/process-documents
```

3. Check the response for processing status and results

## Troubleshooting

Common issues and solutions:

1. **Missing OpenAI API Key**
   - Verify `.env.local` exists in project root
   - Ensure key is properly formatted
   - Restart Next.js server after changes

2. **PDF Processing Errors**
   - Check file format (must be PDF)
   - Verify file size limits
   - Check Supabase storage permissions

3. **Environment Variables**
   - Ensure all required variables are set
   - Restart server after changes
   - Check for typos in variable names

## Next Steps

1. Implement persistent vector storage
2. Add document querying capabilities
3. Create a user interface for document management
4. Add batch processing support
5. Implement error recovery

## Security Considerations

- Keep API keys secure
- Use environment variables
- Implement proper access controls
- Validate file types and sizes
- Monitor API usage

## Resources

- [Langchain Documentation](https://js.langchain.com/docs/)
- [Supabase Storage Guide](https://supabase.com/docs/guides/storage)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference) 