import OpenAI from "openai";
import dedent from "dedent";
import shadcnDocs from "@/utils/shadcn-docs";
import { z } from "zod";

const openai = new OpenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  // Fix 1: Removed trailing slash to prevent double-slash 404s
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const result = z
      .object({
        messages: z.array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string(),
          }),
        ),
      })
      .safeParse(json);

    if (result.error) {
      return new Response(result.error.message, { status: 422 });
    }

    const { messages } = result.data;
    const systemPrompt = getSystemPrompt(); 

    const completion = await openai.chat.completions.create({
      // Fix 2: Using the most stable 2025 model name
      model: "gemini-1.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role,
          content: m.role === "user" 
            ? m.content + "\nIMPORTANT: Return ONLY raw code. No markdown, no backticks, no 'tsx' labels." 
            : m.content,
        })),
      ],
      temperature: 0.7, // Lowered for better code stability
      stream: false, 
      // Fix 3: Lowered max_tokens to stay safe from 404 limit errors
      max_tokens: 4096, 
    });

    const content = completion.choices[0]?.message?.content || '';

    // Check if the code is actually there
    if (!content || content.length < 10) {
      return new Response(
        JSON.stringify({ error: 'AI returned empty code. Check your API quota.' }),
        { status: 500 }
      );
    }

    return new Response(content, {
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error: any) {
    console.error('Final API Error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: error.status || 500 }
    );
  }
}

function getSystemPrompt() {
  return dedent`
    You are an expert frontend React engineer.
    ALWAYS use shadcn/ui components from "@/components/ui/...".
    Use Tailwind CSS. Return ONLY the code for a single file.
    Do NOT use backticks (\`\`\`). Do NOT say "Here is your code".
    
    Components available: ${shadcnDocs.map((c) => c.name).join(", ")}
  `;
}
