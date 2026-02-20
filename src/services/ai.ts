import { ModelManager, ModelCategory } from '@runanywhere/web';
import { TextGeneration } from '@runanywhere/web-llamacpp';
import { db } from './db';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────
interface Transaction {
  id?: number;
  amount: number;
  category: string;
  item: string;
  vendor: string | null;
  date: string;
  createdAt?: string;
}

interface AISnapshot {
  last30Days: { total: number; count: number; avg: number };
  monthlyTotal: number;
  categories: Array<{ category: string; amount: number; count: number }>;
  recurring: Array<{ name: string; category: string; total: number; avg: number; count: number }>;
  transactionCount: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Constants - Pre-defined patterns for fast responses
// ──────────────────────────────────────────────────────────────────────────────
const SMALL_TALK_PATTERNS = [
  /^h+i+\s*$/i, /^h+e+l+o+\s*$/i, /^hey\s*$/i,
  /^good\s*(morning|evening|afternoon|night)/i,
  /^thanks?\s*(you)?\s*$/i, /^ok\s*$/i, /^okay\s*$/i,
  /^bye\s*$/i, /^how are you/i, /^what('s| is) up/i,
  /^sup\s*$/i, /^yo\s*$/i,
];

const SMALL_TALK_REPLIES = [
  "Hey! 👋 Ask me anything about your spending — like totals, recurring purchases, or category breakdowns.",
  "Hi there! I'm your financial coach. Ask me about your expenses and I'll give precise insights.",
  "Hello! 💰 Try asking: 'What did I spend this month?' or 'Which category costs most?'",
];

// ──────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────────────────────────
function isSmallTalk(query: string): boolean {
  return SMALL_TALK_PATTERNS.some(pattern => pattern.test(query.trim()));
}

function randomSmallTalkReply(): string {
  return SMALL_TALK_REPLIES[Math.floor(Math.random() * SMALL_TALK_REPLIES.length)];
}

// ──────────────────────────────────────────────────────────────────────────────
// Performance: Smart Yield Function
// Allows UI to update during heavy processing
// ──────────────────────────────────────────────────────────────────────────────
function createYieldFunction(interval: number = 10) {
  let counter = 0;
  return () => {
    counter++;
    if (counter >= interval) {
      counter = 0;
      return new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    return Promise.resolve();
  };
}

const yieldEveryN = createYieldFunction(8);

// ──────────────────────────────────────────────────────────────────────────────
// Caching - Avoid repeated expensive DB queries
// ──────────────────────────────────────────────────────────────────────────────
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class AICache {
  private snapshot: CacheEntry<AISnapshot> | null = null;
  private readonly TTL = 30000; // 30 seconds

  async getSnapshot(): Promise<AISnapshot> {
    const now = Date.now();
    if (this.snapshot && (now - this.snapshot.timestamp) < this.TTL) {
      return this.snapshot.data;
    }
    
    this.snapshot = {
      data: await db.getAISnapshot(),
      timestamp: now,
    };
    return this.snapshot.data;
  }

  invalidate(): void {
    this.snapshot = null;
  }
}

const aiCache = new AICache();

// ──────────────────────────────────────────────────────────────────────────────
// Main AI Service
// ──────────────────────────────────────────────────────────────────────────────
export const aiService = {
  /**
   * Check if the LLM model is loaded and ready
   */
  isModelLoaded(): boolean {
    try {
      const model = ModelManager.getLoadedModel(ModelCategory.Language);
      return model !== null && model !== undefined;
    } catch {
      console.warn('[AI] Model check failed - SDK may not be initialized');
      return false;
    }
  },

  /**
   * Main method to get financial advice from AI
   * @param question - User's question
   * @param onToken - Optional callback for streaming tokens (UI updates)
   */
  async getAdvice(question: string, onToken?: (token: string) => void): Promise<string> {
    // ── Validate model is loaded ───────────────────────────────────────────
    if (!this.isModelLoaded()) {
      const msg = "❌ Model not loaded! Please download the LLM model first.";
      onToken?.(msg);
      return msg;
    }

    // ── Handle small talk with instant response ─────────────────────────────
    if (isSmallTalk(question)) {
      const reply = randomSmallTalkReply();
      onToken?.(reply);
      return reply;
    }

    try {
      // ── Yield to let UI update ───────────────────────────────────────────
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      // ── Get cached data (avoids repeated DB queries) ─────────────────────
      const snapshot = await aiCache.getSnapshot();
      const allTransactions = await db.getAll();
      const recentTxns = allTransactions.slice(0, 10);

      // ── Handle empty data ─────────────────────────────────────────────────
      if (snapshot.transactionCount === 0) {
        const msg = "📝 No expense data yet. Add some transactions first to get personalized insights!";
        onToken?.(msg);
        return msg;
      }

      // ── Yield again before building prompt ─────────────────────────────────
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      // ── Extract key metrics ───────────────────────────────────────────────
      const { total30, count30, avg30, monthTotal } = {
        total30: snapshot.last30Days.total,
        count30: snapshot.last30Days.count,
        avg30: snapshot.last30Days.avg,
        monthTotal: snapshot.monthlyTotal,
      };

      // ── Format transaction data for prompt ────────────────────────────────
      const txnLines = recentTxns
        .map((t: Transaction, i: number) => 
          `${i + 1}. ${t.item}${t.vendor ? ` at ${t.vendor}` : ''} [${t.category}]: ₹${t.amount}`
        )
        .join('\n');

      // ── Format category data ───────────────────────────────────────────────
      const catLines = snapshot.categories.length === 0 
        ? 'None recorded' 
        : snapshot.categories
            .slice(0, 5)
            .map((c: any) => `  • ${c.category}: ₹${c.amount} (${c.count} transactions)`)
            .join('\n');

      // ── Format recurring data ──────────────────────────────────────────────
      const recurringLines = snapshot.recurring.length === 0
        ? 'No recurring purchases detected'
        : snapshot.recurring
            .slice(0, 5)
            .map((r: any) => `  • "${r.name}" [${r.category}] - ${r.count}x, ₹${r.total} total`)
            .join('\n');

      // ── Detect question intent and inject direct answers ───────────────────
      const q = question.toLowerCase();
      let injectedFact = '';

      const detectIntent = () => {
        // Total spending question
        if (q.includes('total') || q.includes('spent') || q.includes('spend') || q.includes('how much')) {
          if (q.includes('month') || q.includes('30') || q.includes('last') || q.includes('overall') || q.includes('this')) {
            injectedFact = `DIRECT ANSWER: Total spending in the last 30 days is exactly ₹${total30} across ${count30} transactions.`;
            return;
          }
          injectedFact = `DIRECT ANSWER: Total spending in the last 30 days is ₹${total30}.`;
          return;
        }
        
        // Recurring purchases
        if (q.includes('recurring') || q.includes('repeat') || q.includes('regular') || q.includes('subscription')) {
          injectedFact = snapshot.recurring.length === 0
            ? 'DIRECT ANSWER: No recurring purchases detected in the last 90 days.'
            : `DIRECT ANSWER: Recurring purchases:\n${recurringLines}`;
          return;
        }
        
        // Average spending
        if (q.includes('average') || q.includes('avg') || q.includes('mean')) {
          injectedFact = `DIRECT ANSWER: Average spending per transaction is ₹${avg30}.`;
          return;
        }
        
        // Category breakdown
        if (q.includes('categor') || q.includes('most') || q.includes('top') || q.includes('breakdown') || q.includes('where')) {
          injectedFact = `DIRECT ANSWER: Spending by category:\n${catLines}`;
          return;
        }
        
        // Transaction count
        if (q.includes('how many') && (q.includes('transaction') || q.includes('purchase') || q.includes('expense'))) {
          injectedFact = `DIRECT ANSWER: You have ${count30} transactions in the last 30 days.`;
          return;
        }
        
        // This month
        if (q.includes('this month') || q.includes('current month')) {
          injectedFact = `DIRECT ANSWER: Spending this calendar month is ₹${monthTotal}.`;
          return;
        }
      };
      
      detectIntent();

      // ── Build optimized prompt ─────────────────────────────────────────────
      const systemPrompt = `You are FinAI, a precise financial assistant.
RULES:
1. NEVER perform arithmetic - use only the pre-calculated numbers provided
2. If a DIRECT ANSWER is provided, use those exact figures
3. Keep responses concise (2-3 sentences max)
4. Use ₹ symbol for Indian Rupees
5. Be helpful and actionable with advice`;

      const userPrompt = `📊 YOUR FINANCIAL DATA (Verified):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Last 30 Days: ₹${total30} | ${count30} transactions | Avg: ₹${avg30}
📆 This Month: ₹${monthTotal}

🛒 Recent Transactions:
${txnLines}

📁 By Category:
${catLines}

🔄 Recurring:
${recurringLines}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${injectedFact ? `⚡ ${injectedFact}\n` : ''}
❓ Question: "${question}"

💡 Provide a helpful, concise answer based on the data above.`;

      // ── Yield before LLM call ────────────────────────────────────────────
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      // ── Generate response with streaming ───────────────────────────────────
      const llmResult = await TextGeneration.generateStream(userPrompt, {
        maxTokens: 150,
        temperature: 0.1,
        topP: 0.9,
        systemPrompt,
      });

      let response = '';

      for await (const token of llmResult.stream) {
        response += token;
        onToken?.(token);
        
        // Yield periodically to prevent UI freeze
        await yieldEveryN();
      }

      await llmResult.result;

      // ── Clean and validate response ────────────────────────────────────────
      const cleaned = response.trim();
      
      if (!cleaned) {
        return `💰 Your total spending in the last 30 days is ₹${total30} across ${count30} transactions.`;
      }

      // Hallucination guard - prevent math errors
      if (/₹[\d,]+\s*[×x*+\-÷/]\s*\d+\s*[=≈]\s*₹[\d,]+/gi.test(cleaned)) {
        return `💰 Your total spending in the last 30 days is ₹${total30} across ${count30} transactions, averaging ₹${avg30} each.`;
      }

      return cleaned;

    } catch (err) {
      console.error('[AI] Error in getAdvice:', err);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      return `⚠️ AI Error: ${errorMsg}. Please try again.`;
    }
  },

  /**
   * Get a quick financial tip
   */
  async getTip(): Promise<string> {
    if (!this.isModelLoaded()) {
      return "💡 Download the model to get personalized tips!";
    }

    try {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      
      const snapshot = await aiCache.getSnapshot();

      if (snapshot.transactionCount === 0) {
        return "💡 Start logging expenses to receive personalized tips.";
      }

      const topCat = snapshot.categories[0];
      const total30 = snapshot.last30Days.total;

      const prompt = `You are a financial advisor. Based on this data:
- Total spending last 30 days: ₹${total30}
- Top category: ${topCat?.category ?? 'N/A'} at ₹${topCat?.amount ?? 0}

Give ONE short, actionable money-saving tip. Be specific with amounts. Use ₹ symbol.`;

      const llmResult = await TextGeneration.generateStream(prompt, {
        maxTokens: 60,
        temperature: 0.2,
      });

      let response = '';
      for await (const token of llmResult.stream) {
        response += token;
        await yieldEveryN();
      }
      await llmResult.result;

      const trimmed = response.trim();
      return trimmed || `💡 Your top spending is ${topCat?.category ?? 'unknown'} at ₹${topCat?.amount ?? 0} — consider setting a weekly budget.`;

    } catch (err) {
      console.error('[AI] Error in getTip:', err);
      return "💡 Keep tracking your expenses consistently for better insights.";
    }
  },

  /**
   * Invalidate cache when new data is added
   */
  refreshData(): void {
    aiCache.invalidate();
  },
};
