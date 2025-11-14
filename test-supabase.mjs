import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xgblxtopsapvacyaurcr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnYmx4dG9wc2FwdmFjeWF1cmNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3Nzg0NDEsImV4cCI6MjA3ODM1NDQ0MX0.9YQbgP9slkz5_MSJIibpCHQe9pNJ0c_JRM8E9a49GpA'
);

const run = async () => {
  const topicsRes = await supabase.from('topics').select('*').order('date', { ascending: false }).limit(2);
  console.log('topics', topicsRes);

  const clipsRes = await supabase
    .from('clips')
    .select('id, status, topic_id, profiles!inner(handle, emoji_avatar)')
    .limit(5);
  console.log('clips', clipsRes);

  process.exit(0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
