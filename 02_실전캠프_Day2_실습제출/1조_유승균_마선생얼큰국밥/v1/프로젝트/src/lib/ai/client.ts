import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import { z } from "zod";

export type Provider = "anthropic" | "openai";

export interface ProviderInfo {
  provider: Provider;
  model: string;
}

const ANTHROPIC_DEFAULT = "claude-opus-5";
const OPENAI_DEFAULT = "gpt-4o-mini";

export function availableProviders(): ProviderInfo[] {
  const out: ProviderInfo[] = [];
  if (process.env.ANTHROPIC_API_KEY?.trim()) out.push({ provider: "anthropic", model: process.env.ANTHROPIC_MODEL?.trim() || ANTHROPIC_DEFAULT });
  if (process.env.OPENAI_API_KEY?.trim()) out.push({ provider: "openai", model: process.env.OPENAI_MODEL?.trim() || OPENAI_DEFAULT });
  return out;
}

export function hasAnyProvider(): boolean {
  return availableProviders().length > 0;
}

export interface StructuredRequest<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  schemaName: string;
  maxTokens?: number;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  provider: Provider;
}

export class AiUnavailableError extends Error {
  constructor() {
    super("AI 키가 설정되지 않았습니다. .env.local 파일에 ANTHROPIC_API_KEY 또는 OPENAI_API_KEY를 넣고 서버를 다시 켜주세요.");
  }
}

/** Anthropic 우선, 실패하거나 키가 없으면 OpenAI로 폴백 */
export async function generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const providers = availableProviders();
  if (!providers.length) throw new AiUnavailableError();

  let lastErr: unknown = null;
  for (const p of providers) {
    try {
      if (p.provider === "anthropic") return await viaAnthropic(req, p.model);
      return await viaOpenAI(req, p.model);
    } catch (e) {
      lastErr = e;
      console.error(`[ai] ${p.provider}(${p.model}) 실패:`, e instanceof Error ? e.message : e);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("AI 생성에 실패했습니다.");
}

async function viaAnthropic<T>(req: StructuredRequest<T>, model: string): Promise<StructuredResult<T>> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model,
    max_tokens: req.maxTokens ?? 16000,
    system: req.system,
    messages: [{ role: "user", content: req.user }],
    output_config: { format: zodOutputFormat(req.schema) },
  });
  if (response.stop_reason === "refusal") {
    throw new Error("AI가 이 요청의 생성을 거절했습니다. 리뷰 내용을 확인해주세요.");
  }
  if (!response.parsed_output) throw new Error("AI 응답을 구조화된 형식으로 읽지 못했습니다.");
  return { data: response.parsed_output, model: response.model, provider: "anthropic" };
}

/** OpenAI 폴백: zod v4의 내장 JSON Schema 변환 + json_schema 응답 형식, 결과는 zod로 재검증(최대 2회 시도) */
async function viaOpenAI<T>(req: StructuredRequest<T>, model: string): Promise<StructuredResult<T>> {
  const client = new OpenAI();
  const jsonSchema = z.toJSONSchema(req.schema as z.ZodType, { target: "draft-7", io: "output" }) as Record<string, unknown>;
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: req.system + "\n\n반드시 지정된 JSON 스키마에 맞는 JSON만 출력합니다." + (lastError ? `\n\n이전 출력의 오류: ${lastError}` : "") },
        { role: "user", content: req.user },
      ],
      response_format: { type: "json_schema", json_schema: { name: req.schemaName, schema: jsonSchema, strict: false } },
    });
    const msg = completion.choices[0]?.message;
    if (!msg) throw new Error("OpenAI 응답이 비어 있습니다.");
    if (msg.refusal) throw new Error("AI가 이 요청의 생성을 거절했습니다: " + msg.refusal);
    let raw: unknown;
    try {
      raw = JSON.parse(msg.content || "");
    } catch {
      lastError = "JSON 파싱 실패";
      continue;
    }
    const parsed = req.schema.safeParse(raw);
    if (parsed.success) return { data: parsed.data, model: completion.model, provider: "openai" };
    lastError = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }
  throw new Error("OpenAI 응답이 형식에 맞지 않습니다: " + lastError);
}
