import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_MODEL = "gpt-image-1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Please sign in again." }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "Please sign in again." }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    const companionId = body?.companion_id;
    const conversationId = body?.conversation_id ?? null;
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (typeof companionId !== "string" || !UUID.test(companionId)) return json({ error: "Invalid request." }, 400);
    if (conversationId !== null && (typeof conversationId !== "string" || !UUID.test(conversationId))) {
      return json({ error: "Invalid request." }, 400);
    }
    if (!prompt || prompt.length > 1000) {
      return json({ error: "Please describe the image in 1,000 characters or fewer." }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return json({ error: "Image creation isn't connected yet. Add an OpenAI key to turn it on.", code: "not_configured" }, 503);
    }

    const { data: companion, error: companionError } = await supabase
      .from("companions").select("id").eq("id", companionId).maybeSingle();
    if (companionError || !companion) return json({ error: "Companion not found." }, 404);

    let activeConversationId = conversationId as string | null;
    if (activeConversationId) {
      const { data: conversation, error: convError } = await supabase
        .from("conversations").select("id")
        .eq("id", activeConversationId).eq("companion_id", companionId).maybeSingle();
      if (convError || !conversation) return json({ error: "Conversation not found." }, 404);
    }

    const openAiResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: IMAGE_MODEL, prompt, size: "1024x1024", quality: "medium", n: 1 }),
    });
    const openAiBody = await openAiResponse.json().catch(() => null);
    if (!openAiResponse.ok) {
      console.error("image generation failed", openAiResponse.status, openAiBody?.error?.code, openAiBody?.error?.message);
      if (openAiResponse.status === 401) {
        return json({ error: "The OpenAI key was rejected. Please check it and try again.", code: "bad_key" }, 502);
      }
      if (openAiBody?.error?.code === "moderation_blocked" || openAiBody?.error?.code === "content_policy_violation") {
        return json({ error: "That request couldn't be turned into an image. Try describing it differently." }, 422);
      }
      return json({ error: "The image couldn't be created right now. Please try again." }, 502);
    }
    const b64 = openAiBody?.data?.[0]?.b64_json;
    if (typeof b64 !== "string") {
      console.error("image generation returned no image");
      return json({ error: "The image couldn't be created right now. Please try again." }, 502);
    }

    const path = `${userId}/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("chat-media").upload(path, base64ToBytes(b64), { contentType: "image/png" });
    if (uploadError) {
      console.error("generated image upload failed", uploadError);
      return json({ error: "The image was created but couldn't be saved. Please try again." }, 500);
    }

    if (!activeConversationId) {
      const { data: created, error: createError } = await supabase
        .from("conversations")
        .insert({ companion_id: companionId, title: prompt.slice(0, 40), is_active: true })
        .select("id").single();
      if (createError || !created) {
        console.error("conversation create failed", createError);
        return json({ error: "Couldn't start a conversation. Please try again." }, 500);
      }
      activeConversationId = created.id;
    }

    const { error: userMsgError } = await supabase.from("messages").insert({
      conversation_id: activeConversationId, companion_id: companionId, role: "user", content: prompt,
    });
    const { data: assistantMsg, error: assistantMsgError } = await supabase.from("messages").insert({
      conversation_id: activeConversationId,
      companion_id: companionId,
      role: "assistant",
      content: "Here's the image I made for you.",
      model_used: IMAGE_MODEL,
      metadata: { attachments: [{ path, mime_type: "image/png" }], generated_image: true, image_prompt: prompt },
    }).select("id").single();
    if (userMsgError || assistantMsgError || !assistantMsg) {
      console.error("message insert failed", userMsgError, assistantMsgError);
      return json({ error: "The image was created but couldn't be added to the chat." }, 500);
    }

    const { data: conv } = await supabase
      .from("conversations").select("message_count").eq("id", activeConversationId).maybeSingle();
    await supabase.from("conversations")
      .update({ message_count: (conv?.message_count ?? 0) + 2, last_message_at: new Date().toISOString() })
      .eq("id", activeConversationId);

    return json({ conversation_id: activeConversationId, message_id: assistantMsg.id });
  } catch (err) {
    console.error("generate-image error", err);
    return json({ error: "Something went wrong creating the image. Please try again." }, 500);
  }
});
