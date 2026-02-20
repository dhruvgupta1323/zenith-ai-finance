# Zenith AI Finance

**Status: ✅ FULLY WORKING - NO ERRORS**

A privacy-first, on-device financial assistant built with the RunAnywhere Web SDK. All AI processing (LLM, STT, TTS, VAD) happens locally in your browser - zero cloud data leakage.

---

**Built on top of**: [RunAnywhere Web Starter App](https://github.com/RunanywhereAI/runanywhere-sdks)

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 - App loads in 5-10 seconds, no errors!

See [WORKING.md](./WORKING.md) for detailed testing guide.

## Features

### 1. Natural Language Expense Logging
- **Text Input**: Type expenses naturally (e.g., "Spent $45 on groceries at Whole Foods")
- **Voice Input**: Use speech-to-text to log expenses hands-free
- **AI Parsing**: On-device LLM extracts amount, category, vendor, and item automatically
- **Local Storage**: All transactions saved in browser's local SQLite database

### 2. Privacy-First Financial Coach
- **AI Advisor**: Ask questions about your spending, savings, and financial health
- **RAG Context**: Coach uses your local transaction data to provide personalized advice
- **Streaming Responses**: Real-time token streaming for smooth UX
- **Zero Cloud**: All inference happens on your device

### 3. Financial Health Dashboard
- **Wellness Score**: 0-100 score based on savings rate and budget adherence
- **Spending Trends**: Track if spending is increasing, stable, or decreasing
- **Category Breakdown**: Visual charts showing top spending categories
- **Daily Tips**: AI-generated bite-sized financial advice

### 4. Bill Prediction Calendar
- **Pattern Detection**: AI analyzes transactions to detect recurring bills
- **Confidence Scores**: Shows how confident the system is about each pattern
- **Visual Calendar**: See predicted bills on a monthly calendar
- **Cash Flow Planning**: Avoid surprises with predicted upcoming expenses

### 5. Anomaly & Fraud Detection
- **Baseline Analysis**: Establishes normal spending per category
- **Real-time Alerts**: Warns when transactions exceed 200% of baseline
- **Severity Levels**: Low, medium, and high severity indicators

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Models are downloaded on first use and cached in the browser's Origin Private File System (OPFS).

## Usage

### Logging an Expense

**Text Mode:**
```
"Spent $25.50 on lunch at Chipotle"
"Coffee this morning cost $4.50"
"$150 electric bill from PG&E"
```

**Voice Mode:**
1. Tap "Start Recording"
2. Speak naturally: "I spent forty five dollars on groceries at Safeway"
3. AI will parse and save automatically

### Asking the Financial Coach

Try questions like:
- "Can I afford a $500 laptop?"
- "How can I reduce my spending?"
- "What are my biggest expenses?"
- "Am I spending too much on food?"
- "How much should I save each month?"

The coach uses your last 30 days of data to provide personalized advice.

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **AI Engine**: RunAnywhere Web SDK
  - LLM: LFM2 350M (on-device language model)
  - STT: Whisper Tiny English (speech-to-text)
  - TTS: Piper TTS (text-to-speech)
  - VAD: Silero VAD v5 (voice activity detection)
- **Local Storage**: SQL.js (SQLite in browser)
- **Charts**: Recharts
- **Date Utils**: date-fns

## Privacy Guarantee

- **100% Local Processing**: All AI inference happens in your browser
- **No External APIs**: Zero network calls for model inference
- **Local Database**: Transactions stored in browser's IndexedDB/localStorage
- **No Tracking**: No analytics, no telemetry, no data collection

## Project Structure

```
src/
├── models/          # TypeScript types & data models
│   └── Transaction.ts
├── services/        # Core business logic
│   ├── DatabaseService.ts   # SQLite operations
│   └── AIService.ts          # LLM/STT/TTS integration
├── components/      # React UI components
│   ├── DashboardTab.tsx      # Health score & insights
│   ├── ExpenseTab.tsx        # Expense logger
│   ├── CoachTab.tsx          # AI chat interface
│   ├── BillsTab.tsx          # Recurring bills calendar
│   └── ModelBanner.tsx       # Download progress UI
├── hooks/           # React hooks
│   └── useModelLoader.ts
├── workers/
│   └── vlm-worker.ts
├── styles/          # CSS
│   └── index.css
├── runanywhere.ts   # SDK initialization
└── App.tsx          # Main app component
```

## Model Configuration

The app uses quantized models optimized for on-device inference:

- **LLM**: LFM2-350M-Q4_K_M (~250 MB)
- **STT**: Whisper Tiny English (~105 MB)
- **TTS**: Piper TTS Lessac Medium (~65 MB)
- **VAD**: Silero VAD v5 (~5 MB)

**Total model size**: ~425 MB (downloaded once, cached in browser)

## Deployment

### Vercel

```bash
npm run build
npx vercel --prod
```

The included `vercel.json` sets the required Cross-Origin-Isolation headers.

### Netlify

Add a `_headers` file:

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: credentialless
```

### Any static host

Serve the `dist/` folder with these HTTP headers on all responses:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

## Browser Requirements

- Chrome 96+ or Edge 96+ (recommended: 120+)
- WebAssembly (required)
- SharedArrayBuffer (requires Cross-Origin Isolation headers)
- OPFS (for persistent model cache)
- Recommended 4GB+ RAM for smooth operation

## Performance Tips

1. **WebGPU**: Use Chrome/Edge for GPU acceleration (10x faster inference)
2. **CPU Mode**: Falls back to WASM if WebGPU unavailable
3. **Model Download**: First-time setup downloads models (one-time, ~5 min)
4. **Data Persistence**: Stored in browser; clearing cache = losing data

## Future Enhancements

- [ ] Budget planning & goal tracking
- [ ] Multi-currency support
- [ ] Export data (CSV, PDF reports)
- [ ] Shared expenses with family/roommates
- [ ] Bank account integration (read-only, local parsing)
- [ ] Voice-controlled UI navigation

## Troubleshooting

### "Cannot read image.png" or Model Errors

**Cause**: VLM (Vision Language Model) trying to initialize when not needed.

**Fix**: VLM has been removed from Zenith AI Finance. If you still see this error:
1. Clear browser cache and reload
2. Check browser console for specific error details
3. Ensure you're using Chrome 113+ or Edge 113+

### Models Not Downloading

**Cause**: Browser cache full or network issues.

**Fix**:
1. Open browser DevTools → Application → Storage
2. Clear OPFS (Origin Private File System) data
3. Reload and re-download models

### Slow Performance

**Cause**: Running in CPU mode without WebGPU.

**Fix**:
1. Use Chrome 113+ or Edge 113+ for WebGPU support
2. Enable hardware acceleration in browser settings
3. Close other tabs to free up memory

### Database Not Persisting

**Cause**: Browser in incognito mode or storage limits reached.

**Fix**:
1. Use normal browsing mode (not incognito)
2. Check browser storage permissions
3. Free up browser storage space

### Voice Input Not Working

**Cause**: Microphone permissions or model not loaded.

**Fix**:
1. Grant microphone permissions when prompted
2. Ensure VAD + STT models are downloaded (check banner)
3. Test microphone in browser settings

## Documentation

- [RunAnywhere SDK API Reference](https://docs.runanywhere.ai)
- [npm package](https://www.npmjs.com/package/@runanywhere/web)
- [GitHub](https://github.com/RunanywhereAI/runanywhere-sdks)

## Acknowledgments

Built with [RunAnywhere Web SDK](https://runanywhere.ai) - bringing AI to the edge, one browser at a time.

## License

MIT

#   z e n i t h - a i - f i n a n c e  
 