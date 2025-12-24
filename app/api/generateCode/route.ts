import OpenAI from "openai";
import dedent from "dedent";
import shadcnDocs from "@/utils/shadcn-docs";
import { z } from "zod";

// 1. Tell Vercel to allow this function to run for up to 60 seconds (max for Hobby)
export const maxDuration = 60; 

const openai = new OpenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  // Ensure the baseURL has NO trailing slash to avoid 404 double-slashes
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const result = z.object({
      messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })),
    }).safeParse(json);

    if (result.error) return new Response(result.error.message, { status: 422 });

    const { messages } = result.data;

    // 2. Request a STREAMING response from Gemini
    const response = await openai.chat.completions.create({
      model: "gemini-1.5-flash",
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...messages.map((m) => ({
          role: m.role,
          content: m.role === "user" 
            ? m.content + "\nReturn ONLY raw React code. No markdown backticks." 
            : m.content,
        })),
      ],
      stream: true, // Crucial: Keeps the Vercel function alive
      temperature: 0.7,
    });

    // 3. Convert the OpenAI stream into a ReadableStream for the browser
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of response) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              controller.enqueue(encoder.encode(content));
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    // Return the stream as plain text so the frontend can display it live
    return new Response(stream, {
      headers: { 
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });

  } catch (error: any) {
    console.error("Streaming Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

function getSystemPrompt() {
  return dedent`
    You are an expert React engineer. 
    Build a modern, responsive landing page using Tailwind CSS and shadcn/ui.
    Import components from "@/components/ui/...".
    Return ONLY the code for a single file. No explanations.
    
    Available Components: ${shadcnDocs.map((c) => c.name).join(", ")}
  `;
}
