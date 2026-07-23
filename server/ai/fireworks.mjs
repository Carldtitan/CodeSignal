export const DEFAULT_FIREWORKS_MODEL = 'accounts/fireworks/models/glm-5p2';
export const DEFAULT_FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1';

export class FireworksError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'FireworksError';
    this.status = status;
  }
}

export class FireworksClient {
  constructor({
    apiKey = process.env.FIREWORKS_API_KEY,
    model = process.env.FIREWORKS_MODEL || DEFAULT_FIREWORKS_MODEL,
    baseUrl = process.env.FIREWORKS_BASE_URL || DEFAULT_FIREWORKS_BASE_URL,
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.apiKey = apiKey?.trim() || '';
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
  }

  status() {
    return {
      configured: Boolean(this.apiKey),
      provider: 'Fireworks AI',
      model: this.model,
    };
  }

  async completeJson({ system, user, maxTokens = 5000, temperature = 0.1 }) {
    if (!this.apiKey) {
      throw new FireworksError('Set FIREWORKS_API_KEY in .env and restart the server to enable AI generation.', 503);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: `${system}\nReturn only valid JSON matching the requested shape.` },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
          reasoning_effort: 'high',
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === 'AbortError') throw new FireworksError('Fireworks timed out after three minutes.', 504);
      throw new FireworksError(`Could not reach Fireworks: ${error.message}`, 502);
    } finally {
      clearTimeout(timeout);
    }

    let payload;
    try { payload = await response.json(); } catch { throw new FireworksError('Fireworks returned a non-JSON response.', 502); }
    if (!response.ok) {
      const message = payload.error?.message || payload.message || `Fireworks returned status ${response.status}.`;
      throw new FireworksError(message, response.status === 401 ? 401 : 502);
    }
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new FireworksError('Fireworks returned an empty completion.', 502);
    try {
      return { data: JSON.parse(content), usage: payload.usage || null };
    } catch {
      throw new FireworksError('GLM did not return valid JSON. Please try again.', 502);
    }
  }
}
