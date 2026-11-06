import Anthropic from "@anthropic-ai/sdk";

/** Turn an error from a turn into a short Turkish message for the user. */
export function explainError(err) {
  if (err instanceof Anthropic.AuthenticationError)
    return "Kimlik doğrulama başarısız. ANTHROPIC_API_KEY ortam değişkenini ayarla (https://console.anthropic.com).";
  if (err instanceof Anthropic.RateLimitError) return "Hız sınırına takıldın, biraz bekleyip tekrar dene.";
  if (err instanceof Anthropic.BadRequestError) return `İstek hatası: ${err.message}`;
  if (err instanceof Anthropic.APIUserAbortError) return "Durduruldu.";
  if (err instanceof Anthropic.APIError) return `API hatası ${err.status ?? ""}: ${err.message}`;
  if (err?.name === "AbortError") return "Durduruldu.";
  return `Hata: ${err?.stack || err}`;
}
