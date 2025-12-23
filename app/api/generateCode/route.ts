import OpenAI from "openai";
import dedent from "dedent";
import shadcnDocs from "@/utils/shadcn-docs";
import { z } from "zod";

// This is configured to use Google Gemini's OpenAI-compatible interface
const openai = new OpenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
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
      console.error('Validation error:', result.error);
      return new Response(result.error.message, { status: 422 });
    }

    const { messages } = result.data;
    const systemPrompt = getSystemPrompt(); 

    // We use gemini-1.5-flash because it is fast and free
    const completion = await openai.chat.completions.create({
      model: "gemini-1.5-flash",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        ...messages.map((message) => ({
          ...message,
          content:
            message.role === "user"
              ? message.content +
                "\nPlease ONLY return code, NO backticks or language names. React code only with tailwindcss"
              : message.content,
        })),
      ],
      temperature: 0.9,
      stream: false, 
      max_tokens: 8192, 
    });

    const content = completion.choices[0]?.message?.content || '';

    // Check if the code is actually there
    if (!content || !content.includes('export default')) {
      return new Response(
        JSON.stringify({ error: 'Generated code is incomplete' }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(content, {
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error: any) {
    console.error('API error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

function getSystemPrompt() {
  return dedent`
    You are an expert frontend React engineer specializing in shadcn/ui.
    ALWAYS use shadcn/ui components. Import from "@/components/ui/...".
    Use Tailwind CSS. Return ONLY the code for a single file.
    
    Available shadcn/ui Components:
    ${shadcnDocs.map((c) => c.name).join(", ")}
    
    ${shadcnDocs.map((c) => `Component: ${c.name}\nUsage: ${c.usageDocs}`).join("\n")}
  `;
}
