import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase
  .from("screener_latest_results")
  .select("symbol, strategy, market, composite_score")
  .order("symbol");

if (error) console.log("ERROR", error);
else console.table(data);
