import Workflow from '../shared/assistant-workflow.js';

export class ModelServiceError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}

// 仅由服务端装配；两家厂商共用检索、上下文、频控与记忆，不开放客户端模型配置。
export function createAssistantModel({ env, network = fetch }) {
  const bailian = env.XIAOYA_AI_ENABLED === 'bailian-free';
  const gemini = env.XIAOYA_AI_ENABLED === 'gemini-free';
  if ((!bailian && !gemini) || env.XIAOYA_AI_FREE_PLAN_CONFIRMED !== 'true') return null;
  const key = bailian ? env.DASHSCOPE_API_KEY : env.GEMINI_API_KEY;
  // @CfSecAICode 遵循消费金融安全编码 BE-SECRET-001 规范: 仅使用服务端独立密钥；百炼先确认平台用完即停，Google先确认免费层数据使用条款。
  if (!key || (bailian ? env.XIAOYA_BAILIAN_FREE_ONLY_CONFIRMED !== 'true' : env.XIAOYA_GEMINI_DATA_USE_CONFIRMED !== 'true')) return null;
  const provider = bailian ? 'bailian' : 'gemini';
  const name = bailian ? 'qwen3.8-flash' : 'gemini-3.5-flash-lite';
  const meta = {
    provider, id: provider + ':' + name,
    label: bailian ? '百炼 · Qwen3.8 Flash' : 'Google · Gemini 3.5 Flash-Lite',
    quotaUrl: bailian ? 'https://bailian.console.aliyun.com/cn-beijing/costing-balance/free-quota' : 'https://aistudio.google.com/rate-limit',
    quotaNote: bailian ? '赠送Token有有效期，账户剩余额度以官方控制台为准；仅使用北京地域及已开启用完即停的模型。' : '免费额度按项目和模型计算，日额度按美国太平洋时间重置；账户当前用量以官方控制台为准。',
  };
  async function generate(payload, { signal } = {}) {
    const endpoint = bailian ? 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' : 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';
    const messages = payload.messages.map(({ role, content }) => ({ role, content }));
    const body = bailian ? {
      model: name, messages, temperature: 0.2, max_tokens: Workflow.safeguards.outputTokens,
      response_format: { type: 'json_object' }, enable_thinking: false, preserve_thinking: false,
    } : {
      systemInstruction: { parts: messages.filter(item => item.role === 'system').map(item => ({ text: item.content })) },
      contents: messages.filter(item => item.role !== 'system').map(item => ({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: item.content }] })),
      generationConfig: { temperature: 0.2, maxOutputTokens: Workflow.safeguards.outputTokens, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'MINIMAL' } },
    };
    // 固定官方端点、不跟随重定向、不传联网工具；密钥不放在URL或返回值中。
    const response = await network(endpoint, {
      method: 'POST', redirect: 'error', signal: signal || AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/json', ...(bailian ? { Authorization: 'Bearer ' + key } : { 'x-goog-api-key': key }) },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      if (response.status === 429) throw new ModelServiceError(429, 'AI_RATE_LIMITED', '模型额度或调用频率已达平台上限，请稍后再试；不会自动重试或切换付费服务。');
      if (response.status === 402 || response.status === 403) throw new ModelServiceError(503, 'AI_ACCESS_OR_QUOTA', '模型额度或访问权限不足，请检查官方控制台；不会自动充值或切换付费服务。');
      if (response.status === 401) throw new ModelServiceError(503, 'AI_NOT_CONFIGURED', '模型服务授权无效，请检查服务端配置。');
      throw new ModelServiceError(503, 'AI_UNAVAILABLE', '模型服务暂不可用；未自动重试，站内检索仍可使用。');
    }
    const result = await response.json();
    const finishReason = bailian ? result.choices?.[0]?.finish_reason : result.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== (bailian ? 'stop' : 'STOP')) throw new ModelServiceError(503, 'AI_INCOMPLETE', '模型未返回完整回答；未自动追加请求，请缩短问题后再试。');
    if (bailian) return result;
    return {
      choices: [{ message: { content: (result.candidates?.[0]?.content?.parts || []).filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('') } }],
      usage: { prompt_tokens: result.usageMetadata?.promptTokenCount, completion_tokens: result.usageMetadata?.candidatesTokenCount },
    };
  }
  return { ...meta, generate };
}
