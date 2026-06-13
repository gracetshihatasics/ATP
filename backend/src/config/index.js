export const config = {
  port:        parseInt(process.env.PORT  || "3579"),
  apiKey:      process.env.ANTHROPIC_API_KEY || "",
  model:       "claude-sonnet-4-6",
  maxTokens:   2000,
  browser: {
    headless:  true,
    viewport:  { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    timeout: {
      navigation:   60_000,   // 60s — slow sites need time
      action:       15_000,   // 15s per action
      element:      20_000,   // 20s waiting for element to appear
      stable:        2_000,   // 2s wait for animations to settle
      afterScroll:   1_500,   // 1.5s after scroll before clicking
      afterNavigation: 1_000, // 1s after page load before acting
      afterClick:      800,   // 0.8s after click for page to react
    },
  },
  screenshot: {
    type:    "jpeg",
    quality: 60,
    fullPage: false,
  },
  eval: {
    confidenceThreshold: 70,
    prodReadyThreshold:  85,
  },
};
