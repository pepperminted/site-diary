import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://mtsylnuvzpcmngbkkbpr.supabase.co"
const supabaseAnonKey = "sb_publishable_pdlkUxrzjoyEn06LZyFmLQ_S7-iWJ91"

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
