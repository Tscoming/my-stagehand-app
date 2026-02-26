# GEMINI.md

## Project Overview
`my-stagehand-app` is a web automation agent built using [Stagehand](https://github.com/browserbase/stagehand), a high-level browser automation SDK. The project specifically focuses on automating interactions with the **Douyin (TikTok China) Creator Platform** (`creator.douyin.com`).

### Main Technologies
- **Framework:** [Stagehand](https://github.com/browserbase/stagehand) (built on Playwright)
- **Language:** TypeScript
- **Runtime:** Node.js (executed via `tsx`)
- **AI Model:** DeepSeek-V3 (configured via OpenAI-compatible API)
- **Authentication:** Cookie-based session persistence using JSON files.

### Architecture
The main logic resides in `index.ts`, which:
1. Initializes a `Stagehand` instance in `LOCAL` mode.
2. Loads authentication cookies from `cookies/douyin.json`.
3. Injects cookies into the browser context (supporting both direct context injection and `document.cookie` fallback).
4. Navigates to the Douyin Creator Center.
5. Performs AI-driven actions (`act`) and data extraction (`extract`).

---

## Building and Running

### Prerequisites
- Node.js installed.
- API Key for the AI model (DeepSeek/OpenAI).
- Douyin cookies in `cookies/douyin.json`.

### Key Commands
- **Install Dependencies:**
  ```bash
  npm install
  ```
- **Start the Application:**
  ```bash
  npm start
  ```
  *This runs `tsx index.ts` directly.*
- **Build Project:**
  ```bash
  npm run build
  ```
  *Compiles TypeScript to JavaScript using `tsc`.*

### Environment Variables
Create a `.env` file based on `.env.example`:
- `OPENAI_API_KEY`: Your API key for the AI model.
- `OPENAI_BASE_URL`: (Optional) Base URL if using a provider other than OpenAI (e.g., DeepSeek).

---

## Development Conventions

### Stagehand Usage
- **Atomic Actions:** Use `stagehand.act()` with specific, natural language instructions.
- **Data Extraction:** Use `stagehand.extract()` to retrieve structured data from the page.
- **Context Management:** Access the underlying Playwright page via `stagehand.page` (or `stagehand.context.pages()[0]`).

### Authentication Pattern
The project uses a custom cookie injection strategy in `index.ts` to bypass manual login. When modifying the authentication logic, ensure both `internalContext.addCookies` and the `document.cookie` fallback are considered for robustness.

### Language
Since the target platform is Douyin, many `act` and `extract` instructions are written in **Chinese** to better match the UI elements of the site.

### Coding Style
- Follows standard TypeScript conventions.
- Uses `dotenv/config` for environment variable management.
- Prefers `tsx` for fast development without a separate build step.
