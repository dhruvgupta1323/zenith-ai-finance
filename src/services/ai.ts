import { ModelManager, ModelCategory } from '@runanywhere/web';
import { TextGeneration } from '@runanywhere/web-llamacpp';
import { db } from './db';

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

function isSmallTalk(q: string) { return SMALL_TALK_PATTERNS.some(p => p.test(q.trim())); }
function randomSmallTalkReply() { return SMALL_TALK_REPLIES[Math.floor(Math.random() * SMALL_TALK_REPLIES.length)]; }

// ── Yield to the browser event loop so UI stays responsive ──────────────────
const yieldToMain = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

// ── Cache for AI snapshot to avoid repeated DB queries ──────────────────────
let cachedSnapshot: any = null;
let snapshotCacheTime = 0;
const SNAPSHOT_CACHE_TTL = 30000; // 30 seconds cache

async function getCachedSnapshot() {
  const now = Date.now();
  if (cachedSnapshot && (now - snapshotCacheTime) < SNAPSHOT_CACHE_TTL) {
    return cachedSnapshot;
  }
  cachedSnapshot = await db.getAISnapshot();
  snapshotCacheTime = now;
  return cachedSnapshot;
}

export const aiService = {
  isModelLoaded(): boolean {
    try {
      return ModelManager.getLoadedModel(ModelCategory.Language) !== null;
    } catch { return false; }
  },

  async getAdvice(question: string, onToken?: (token: string) => void): Promise<string> {
    if (!this.isModelLoaded()) return "❌ Model not loaded! Please download the LLM model first.";

    if (isSmallTalk(question)) {
      const reply = randomSmallTalkReply();
      onToken?.(reply);
      return reply;
    }

    try {
      // ── Yield before heavy DB work so UI can update first ────────────────
      await yieldToMain();

      const snapshot        = await db.getAISnapshot();
      const allTransactions = await db.getAll();
      const recentTxns      = allTransactions.slice(0, 10);

      if (snapshot.transactionCount === 0) {
        const msg = "No expense data yet. Add some transactions first!";
        onToken?.(msg);
        return msg;
      }

      await yieldToMain(); // yield again before building prompts

      const { total30, count30, avg30, monthTotal } = {
        total30:    snapshot.last30Days.total,
        count30:    snapshot.last30Days.count,
        avg30:      snapshot.last30Days.avg,
        monthTotal: snapshot.monthlyTotal,
      };

      const txnLines = recentTxns
        .map((t: Transaction, i: number) => `${i + 1}. ${t.item}${t.vendor ? ` at ${t.vendor}` : ''} [${t.category}]: ₹${t.amount}`)
        .join('\n');

      const catLines = snapshot.categories.length === 0 ? 'None'
        : snapshot.categories.map((c: any) => `  • ${c.category}: ₹${c.amount} (${c.count} txn${c.count > 1 ? 's' : ''})`).join('\n');

      const recurringLines = snapshot.recurring.length === 0
        ? 'NONE — no repeated purchases detected'
        : snapshot.recurring.map((r: any) => `  • "${r.name}" [${r.category}] — ${r.count}x, total ₹${r.total}, avg ₹${r.avg}`).join('\n');

      const q = question.toLowerCase();
      let injectedFact = '';

      if ((q.includes('total') || q.includes('spent') || q.includes('spend') || q.includes('how much')) &&
          (q.includes('month') || q.includes('30') || q.includes('last') || q.includes('overall'))) {
        injectedFact = `DIRECT ANSWER: Total spending in the last 30 days is exactly ₹${total30} across ${count30} transactions.`;
      } else if (q.includes('how much')) {
        injectedFact = `DIRECT ANSWER: Total spending in the last 30 days is ₹${total30}.`;
      } else if (q.includes('recurring') || q.includes('repeat') || q.includes('regular')) {
        injectedFact = snapshot.recurring.length === 0
          ? 'DIRECT ANSWER: There are NO recurring purchases in the last 90 days.'
          : `DIRECT ANSWER: Recurring purchases found:\n${recurringLines}`;
      } else if (q.includes('average') || q.includes('avg')) {
        injectedFact = `DIRECT ANSWER: Average spending per transaction is ₹${avg30}.`;
      } else if (q.includes('categor') || q.includes('most') || q.includes('top') || q.includes('breakdown')) {
        injectedFact = `DIRECT ANSWER: Spending by category:\n${catLines}`;
      } else if (q.includes('how many') && q.includes('transaction')) {
        injectedFact = `DIRECT ANSWER: There are ${count30} transactions in the last 30 days.`;
      } else if (q.includes('this month') || q.includes('current month')) {
        injectedFact = `DIRECT ANSWER: Spending this calendar month is ₹${monthTotal}.`;
      }

      const systemPrompt = `You are a precise financial assistant. Use ONLY the verified data provided.
RULES:
1. NEVER do arithmetic — all numbers are pre-calculated.
2. If a DIRECT ANSWER line is given, use those exact numbers.
3. Answer in 2-3 sentences max.
4. Do not speculate. Use ₹ symbol for currency.`;

      const userPrompt = `VERIFIED FINANCIAL DATA:
[ LAST 30 DAYS ] Total: ₹${total30} | Transactions: ${count30} | Avg: ₹${avg30}
[ THIS MONTH ] Total: ₹${monthTotal}
[ RECENT TRANSACTIONS ]
${txnLines}
[ BY CATEGORY ]
${catLines}
[ RECURRING ]
${recurringLines}
${injectedFact ? `\n⚡ ${injectedFact}\n` : ''}
USER QUESTION: "${question}"
Answer in 2-3 sentences. No math.`;

      // ── Yield one more time before firing the heavy LLM call ─────────────
      await yieldToMain();

      const { stream, result } = await TextGeneration.generateStream(userPrompt, {
        maxTokens: 150,
        temperature: 0.1,
        systemPrompt,
      });

      let response = '';
      let tokenCount = 0;

      for await (const token of stream) {
        response += token;
        onToken?.(token);
        tokenCount++;

        // ── Yield to browser every 8 tokens so UI stays live ─────────────
        if (tokenCount % 8 === 0) {
          await yieldToMain();
        }
      }

      await result;

      const cleaned = response.trim();
      if (!cleaned) return `Total spending in the last 30 days is ₹${total30} across ${count30} transaction${count30 !== 1 ? 's' : ''}.`;

      // Hallucination guard
      if (/₹[\d,]+\s*[×x*]\s*\d+\s*[=≈]\s*₹[\d,]+/gi.test(cleaned)) {
        return `Total spending for the last 30 days is ₹${total30} across ${count30} transaction${count30 !== 1 ? 's' : ''}, avg ₹${avg30} each.`;
      }

      return cleaned;

    } catch (err) {
      console.error('[AI] Error:', err);
      return `⚠️ AI Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
    }
  },

  async getTip(): Promise<string> {
    if (!this.isModelLoaded()) return "💡 Download the model to get personalized tips!";

    try {
      await yieldToMain();
      const snapshot = await db.getAISnapshot();
      const allTransactions = await db.getAll();

      if (snapshot.transactionCount === 0) return "💡 Start logging expenses to receive personalized tips.";

      const topCat  = snapshot.categories[0];
      const total30 = snapshot.last30Days.total;

      const txnLines = allTransactions.slice(0, 5)
        .map((t: Transaction) => `  • ${t.item}${t.vendor ? ` at ${t.vendor}` : ''} [${t.category}]: ₹${t.amount}`)
        .join('\n');

      const topCatLines = snapshot.categories.slice(0, 3)
        .map((c: any) => `  • ${c.category}: ₹${c.amount}`).join('\n');

      const prompt = `Financial data (do not recalculate):
Total last 30 days: ₹${total30}
Top category: ${topCat?.category ?? 'N/A'} at ₹${topCat?.amount ?? 0}
Recent: ${txnLines}
Top categories: ${topCatLines}
Give ONE actionable money-saving tip using the exact amounts. One sentence. Use ₹ symbol.`;

      await yieldToMain();

      const { stream, result } = await TextGeneration.generateStream(prompt, { maxTokens: 80, temperature: 0.2 });

      let response = '';
      for await (const token of stream) { response += token; }
      await result;

      return response.trim() || `💡 Your top spending is ${topCat?.category ?? 'unknown'} at ₹${topCat?.amount ?? 0} — consider setting a weekly limit.`;

    } catch (err) {
      return "💡 Keep tracking your expenses consistently.";
    }
  },
};

type Transaction = {
  id?: number; amount: number; category: string;
  item: string; vendor: string | null; date: string; createdAt?: string;
};