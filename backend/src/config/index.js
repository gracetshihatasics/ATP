export const config = {
  port:        parseInt(process.env.PORT  || "3579"),
  apiKey:      process.env.ANTHROPIC_API_KEY || "",
  model:       "claude-sonnet-4-20250514",
  maxTokens:   2000,
  browser: {
    headless:  true,
    viewport:  { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    timeout:   { navigation: 30_000, action: 8_000 },
  },
  screenshot: {
    type:    "jpeg",
    quality: 60,
    fullPage: false,
  },
};
