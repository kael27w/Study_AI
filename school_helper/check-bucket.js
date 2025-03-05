// Script to check if the Documents bucket exists and create it if it doesn't
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Make sure .env.local file exists with proper values.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAndCreateBucket() {
  try {
    console.log('Checking for existing buckets...');
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('Error listing buckets:', listError);
      return;
    }
    
    console.log('Existing buckets:', buckets.map(b => b.name));
    
    const documentsBucket = buckets.find(b => b.name === 'Documents');
    
    if (documentsBucket) {
      console.log('Documents bucket already exists!');
      
      // Check bucket permissions
      console.log('Checking bucket permissions...');
      const { data: policies, error: policiesError } = await supabase.rpc('get_policies');
      
      if (policiesError) {
        console.log('Could not check policies:', policiesError);
      } else {
        console.log('Policies:', policies);
      }
      
    } else {
      console.log('Documents bucket does not exist. Creating it...');
      const { data, error } = await supabase.storage.createBucket('Documents', {
        public: false,
        fileSizeLimit: 10485760, // 10MB
      });
      
      if (error) {
        console.error('Error creating bucket:', error);
      } else {
        console.log('Documents bucket created successfully!');
      }
    }
    
    // Try to upload a test file
    console.log('Attempting to upload a test file...');
    const testFile = new Uint8Array([0, 1, 2, 3, 4]);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('Documents')
      .upload('test.txt', testFile, {
        contentType: 'text/plain',
        upsert: true
      });
      
    if (uploadError) {
      console.error('Test upload failed:', uploadError);
    } else {
      console.log('Test upload succeeded:', uploadData);
      
      // Clean up test file
      const { error: deleteError } = await supabase.storage
        .from('Documents')
        .remove(['test.txt']);
        
      if (deleteError) {
        console.error('Error deleting test file:', deleteError);
      } else {
        console.log('Test file deleted successfully');
      }
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkAndCreateBucket(); 