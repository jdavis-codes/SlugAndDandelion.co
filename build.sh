#!/bin/bash

# Create js/config.js from environment variables during build
echo "window.SD_CONFIG = {
  supabaseUrl: \"$SUPABASE_URL\",
  supabaseAnonKey: \"$SUPABASE_ANON_KEY\"
};" > js/config.js

echo "Config file generated."
