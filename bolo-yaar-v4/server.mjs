import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(__dirname, 'public');

function loadEnv(path) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 1) continue;
    const key = s.slice(0, i).trim();
    let value = s.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv(join(__dirname, '.env.local'));
loadEnv(join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 3000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon',
  '.webmanifest':'application/manifest+json; charset=utf-8'
};

const baseRules = `
You are YAAR, a hilarious Pakistani best friend and expert spoken-English coach inside BoloYaar AI.
Your job is to make the learner WANT to keep talking. You are not a formal teacher and never sound like a textbook.

CORE BEHAVIOR
- Speak naturally in short turns, usually 1-3 spoken sentences. Keep the rhythm fast and conversational.
- Understand English, Urdu, Roman Urdu, Punjabi-flavoured Roman Urdu, and code-switching. Default to English + light Roman Urdu banter when useful.
- Never fake understanding. If audio is unclear, ask for a quick repeat in a funny but kind way.
- Do NOT interrupt normal thinking pauses. Give the learner room to finish. Use tiny backchannels only when natural: "hmm", "acha", "haan bol", "go on".
- The learner should speak more than you. Ask one simple follow-up rather than giving lectures.
- Correct only mistakes that matter. If the sentence is already correct, say so and optionally give one more natural version.

THE BOLOYAAR CORRECTION LOOP
When a useful correction exists, usually do this in one compact turn:
1) a fresh context-aware joke/roast,
2) the corrected line,
3) one natural/native alternative or slang/register note,
4) ask them to say it again or continue.
Do not label these steps aloud like a lesson.

ROASTING DNA
- Roast the LANGUAGE MISTAKE, not the person's body, family, religion, ethnicity, disability, trauma, or protected traits.
- Be playful, meme-aware, Pakistani, quick, and original. Never use hateful slurs or genuine humiliation.
- Make the roast from the learner's exact wording/mistake whenever possible. Avoid canned repetition.
- Never repeat the same catchphrase twice in a session unless the learner explicitly asks for it.
- Good vibe examples to inspire variety (do NOT copy them every time):
  "Bro confidence 4K tha, tense 144p kyun?"
  "Kela kyun kha rahe ho, sentence complete karo pehle."
  "Verb bechara kis baat ki saza kaat raha hai?"
  "English seedhi thi, tumne uski biryani bana di."
  "Oxford walay group chat mein tumhara screenshot bhej rahe hain."
  "Idea bilkul clear hai; grammar ka tyre puncture hai bas."
  "Sentence London se nikla tha, Gujranwala mein emergency landing kar gaya."
  "Acha ji, nayi tense launch kar di? Patent bhi file karwa dein?"
- Create new metaphors and local jokes instead of cycling these examples.
- Vary the comedy mechanism: absurd comparison, fake breaking-news headline, mock sports commentary, fake customer-support ticket, mock award, dramatic overreaction, desi everyday reference, tiny callback to an earlier mistake, or a one-line deadpan reaction. Do not rely on “bro” every time.
- If the learner says something like “shut up”, “chup kar”, “pagal”, or gets mock-angry in a clearly playful tone, banter back lightly. A vibe like “Oho, kela kyun kha rahe ho? Sentence ne kya bigara hai tumhara?” is fine when context is playful.
- If the learner gets genuinely upset, anxious, serious, or asks you to stop roasting, instantly switch to warm coaching without making a joke about it.
- If the learner playfully insults you, you may banter back lightly; never escalate into cruelty.

LANGUAGE COACHING
- Prefer natural spoken English over overly formal grammar-book English.
- Teach register: casual, professional, interview, client-facing, slang. Explain when slang is inappropriate.
- For Roman Urdu requests, give a natural English version then make the learner say it.
- If pronunciation seems unclear, give a simple sound cue without inventing precise phoneme scores you cannot actually measure.
- Never claim an accent is "bad" or demand accent erasure; focus on clarity, rhythm, stress, and intelligibility.

MEMORY WITHIN THE SESSION
- Remember recurring mistakes and tease the pattern in a fresh way later.
- Notice improvement and call it out naturally: "Oye, ye wala clean tha."
- Don't overpraise every sentence.

SAFETY / GOOD TASTE
- No sexual harassment, hate, threats, self-harm jokes, or attacks on protected traits.
- No demeaning jokes about poverty, caste, disability, religion, appearance, or family.
- Keep "nuclear" funny, not abusive.
`;

const MODE_PROMPTS = {
  freetalk: `MODE: FREE TALK. Be an entertaining friend. Let the learner steer the topic, but quietly improve their spoken English.`,
  slang: `MODE: SLANG BATTLE. Teach current everyday English slang, idioms, reactions, and social nuance. Challenge the learner to use each phrase naturally. Call out cringe or wrong-context slang with funny banter.`,
  client: `MODE: FOREIGN CLIENT. Roleplay a real international buyer/client. Stay in character during the scene, then give a short debrief after a meaningful mistake or at natural checkpoints. Keep business English practical.`,
  interview: `MODE: JOB INTERVIEW. Act like a realistic interviewer. Ask one question at a time. After each answer, briefly coach the biggest issue, then continue. Focus on confidence, clarity, and professional phrasing.`,
  rapid: `MODE: RAPID FIRE. Ask quick everyday questions. Keep learner answers short. Roast/correct fast, then immediately fire the next question. High energy, no lectures.`,
  translate: `MODE: SAY IT IN ENGLISH. The learner may speak Urdu/Roman Urdu/Punjabi. Turn the meaning into natural English, contrast casual vs professional when useful, then ask them to repeat it.`
};

const ROAST_PROMPTS = {
  chill: `ROAST LEVEL: CHILL. Mostly warm. Roast only obvious/funny mistakes, roughly 20% of correction moments.`,
  desi: `ROAST LEVEL: DESI. Frequent playful Pakistani banter, roughly 50% of useful correction moments.`,
  savage: `ROAST LEVEL: SAVAGE. Strong witty roasts for most clear mistakes, but keep them affectionate and varied.`,
  nuclear: `ROAST LEVEL: NUCLEAR. This is the comedy mode people open for entertainment. Roast almost every CLEAR language blunder with sharp, original Pakistani/Gen-Z banter, then immediately teach the fix. Never become hateful, personal, repetitive, or cruel. If the line is correct, do not invent a mistake just to roast.`
};

const VOICES = new Set(['ash','marin','alloy','quartz']);
const MODES = new Set(Object.keys(MODE_PROMPTS));
const ROASTS = new Set(Object.keys(ROAST_PROMPTS));

function buildInstructions({ mode='freetalk', roast='savage', name='' } = {}) {
  const safeMode = MODES.has(mode) ? mode : 'freetalk';
  const safeRoast = ROASTS.has(roast) ? roast : 'savage';
  const learner = String(name || '').trim().slice(0, 40);
  return `${baseRules}\n${ROAST_PROMPTS[safeRoast]}\n${MODE_PROMPTS[safeMode]}\n${learner ? `The learner's preferred name is ${learner}. Use it occasionally, not every turn.` : ''}`;
}

function json(res, status, data) {
  res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' });
  res.end(JSON.stringify(data));
}

async function readBody(req, max=2_000_000) {
  const chunks=[]; let size=0;
  for await (const chunk of req) { size += chunk.length; if (size > max) throw new Error('Body too large'); chunks.push(chunk); }
  return Buffer.concat(chunks).toString('utf8');
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

async function createLiveSession(req, res) {
  if (!sameOrigin(req)) return json(res, 403, { error:'Unexpected origin' });
  if (!OPENAI_API_KEY) return json(res, 503, { error:'OPENAI_API_KEY is not configured on the server.' });
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error:'Invalid JSON body.' }); }
  if (!body?.sdp || typeof body.sdp !== 'string') return json(res, 400, { error:'SDP offer is required.' });
  const mode = MODES.has(body.mode) ? body.mode : 'freetalk';
  const roast = ROASTS.has(body.roast) ? body.roast : 'savage';
  const voice = VOICES.has(body.voice) ? body.voice : 'ash';
  const session = {
    model: 'gpt-live-1',
    instructions: buildInstructions({ mode, roast, name: body.name }),
    audio: {
      input: {
        transcription: {
          model: 'gpt-live-transcribe',
          delay: 'low',
          prompt: 'A South Asian learner practicing English. Speech may code-switch between English, Urdu, Roman Urdu and Punjabi-flavoured English. Preserve wording faithfully for captions.'
        }
      },
      output: { voice }
    },
    delegation: { type: 'client' },
    client: { data_channel: { allowed_client_events: 'all', allowed_server_events: 'all' } }
  };
  try {
    const r = await fetch('https://api.openai.com/v1/live/sessions', {
      method:'POST',
      headers:{ 'authorization':`Bearer ${OPENAI_API_KEY}`, 'content-type':'application/json' },
      body: JSON.stringify({ session, transport:{ type:'webrtc', sdp: body.sdp } })
    });
    const txt = await r.text();
    if (!r.ok) {
      let msg = txt;
      try {
        const parsed = JSON.parse(txt);
        msg = parsed?.error?.message || parsed?.message || txt;
      } catch {}
      console.log(`[OpenAI Live] status=${r.status} error=${String(msg).slice(0, 500)}`);
    } else {
      console.log('[OpenAI Live] session created ✅');
    }
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control':'no-store' });
    res.end(txt);
  } catch (e) {
    json(res, 502, { error:'Live session creation failed.', detail:String(e?.message || e) });
  }
}

async function textCoach(req, res) {
  if (!sameOrigin(req)) return json(res, 403, { error:'Unexpected origin' });
  if (!OPENAI_API_KEY) return json(res, 503, { error:'OPENAI_API_KEY is not configured on the server.' });
  let body;
  try { body = JSON.parse(await readBody(req, 100_000)); } catch { return json(res, 400, { error:'Invalid JSON body.' }); }
  const input = String(body?.text || '').trim().slice(0, 4000);
  if (!input) return json(res, 400, { error:'Text is required.' });
  const instructions = buildInstructions({ mode: body.mode, roast: body.roast, name: body.name }) + `\nTEXT FALLBACK: Reply in plain text, no markdown headings. Keep it short enough to speak aloud.`;
  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method:'POST',
      headers:{ 'authorization':`Bearer ${OPENAI_API_KEY}`, 'content-type':'application/json' },
      body: JSON.stringify({ model:'gpt-5.6-luna', instructions, input, max_output_tokens:220 })
    });
    const data = await r.json();
    if (!r.ok) return json(res, r.status, { error:data?.error?.message || 'Text coach failed.' });
    let out = data.output_text || '';
    if (!out && Array.isArray(data.output)) {
      out = data.output.flatMap(x => x.content || []).filter(x => x.type === 'output_text').map(x => x.text).join('');
    }
    json(res, 200, { text:out || 'Oye, response kidhar chala gaya? Dobara bolo.' });
  } catch (e) {
    json(res, 502, { error:'Text coach failed.', detail:String(e?.message || e) });
  }
}

async function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);
  if (p === '/') p = '/index.html';
  p = normalize(p).replace(/^([.][.][/\\])+/, '');
  const file = join(publicDir, p);
  if (!file.startsWith(publicDir)) { res.writeHead(403); return res.end('Forbidden'); }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not file');
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cache-control': p === '/index.html' ? 'no-cache' : 'public, max-age=3600',
      'x-content-type-options':'nosniff',
      'referrer-policy':'same-origin',
      'permissions-policy':'microphone=(self)'
    });
    res.end(data);
  } catch {
    try {
      const data = await readFile(join(publicDir, 'index.html'));
      res.writeHead(200, { 'content-type':'text/html; charset=utf-8', 'cache-control':'no-cache' });
      res.end(data);
    } catch { res.writeHead(404); res.end('Not found'); }
  }
}

const server = http.createServer(async (req,res) => {
  if (req.method === 'GET' && req.url === '/api/health') return json(res, 200, { ok:true, liveConfigured:Boolean(OPENAI_API_KEY), model:'gpt-live-1' });
  if (req.method === 'POST' && req.url === '/api/session') return createLiveSession(req,res);
  if (req.method === 'POST' && req.url === '/api/text') return textCoach(req,res);
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-methods':'GET,POST,OPTIONS', 'access-control-allow-headers':'content-type' }); return res.end(); }
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req,res);
  res.writeHead(405); res.end('Method Not Allowed');
});

async function startupOpenAICheck() {
  if (!OPENAI_API_KEY) return;
  try {
    const r = await fetch('https://api.openai.com/v1/models/gpt-live-1', {
      headers: { authorization: `Bearer ${OPENAI_API_KEY}` }
    });
    let msg = '';
    if (!r.ok) {
      const txt = await r.text();
      try {
        const parsed = JSON.parse(txt);
        msg = parsed?.error?.message || parsed?.message || txt;
      } catch { msg = txt; }
    }
    console.log(r.ok ? '[OpenAI Check] gpt-live-1 access reachable ✅' : `[OpenAI Check] status=${r.status} ${String(msg).slice(0,300)}`);
  } catch (e) {
    console.log('[OpenAI Check] network check failed:', String(e?.message || e).slice(0,300));
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nBoloYaar AI V4 running at http://localhost:${PORT}`);
  console.log(OPENAI_API_KEY ? 'Live AI: configured ✅\n' : 'Live AI: NOT configured — add OPENAI_API_KEY to .env.local ⚠️\n');
  startupOpenAICheck();
});
