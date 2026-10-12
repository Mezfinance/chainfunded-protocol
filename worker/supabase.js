"use strict";

const WebSocket    = require("ws");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL         = process.env.SUPABASE_URL         || "https://drjpicmejsnixetyqvkv.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("[worker] FATAL: SUPABASE_SERVICE_KEY env var is not set");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  realtime: {
    params:    { eventsPerSecond: 100 },
    transport: WebSocket,   // explicitly use ws package — required in Node.js
  },
});

module.exports = { supabase };
