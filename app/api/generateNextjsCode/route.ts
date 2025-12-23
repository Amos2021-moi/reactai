import OpenAI from "openai";
import dedent from "dedent";
import { z } from "zod";
import { auth } from '@clerk/nextjs/server';

// We point to Google's free Gemini API
const openai = new OpenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

export async function POST(req: Request) {
  // 1. Keeps the login security
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

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

  // 2. Uses Gemini 1.5 Flash (Fast and Free)
  const completionStream = await openai.chat.completions.create({
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
            "\nPlease ONLY return code, NO backticks or language names."
            : message.content,
      })),
    ],
    temperature: 0.2,
    stream: true, 
  });

  // 3. This sends the text to your screen as it is generated
  const stream = new ReadableStream({
    async pull(controller) {
      for await (const chunk of completionStream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          controller.enqueue(new TextEncoder().encode(text));
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function getSystemPrompt() {
  return dedent`
    You are an expert Next.js and React engineer.
    - ALWAYS use Next.js 14+ with App Router.
    - ALWAYS use Tailwind CSS for styling.
    - TypeScript for type safety.
    - Return ONLY the Next.js component code.
    - Do NOT include backticks (\`\`\`) or language names like "tsx".
  `;
}

export const runtime = "edge";
