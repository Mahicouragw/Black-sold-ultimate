/**
 * Synthetic character voices — serverless TTS endpoint.
 *
 * Every NPC has a voice of its own. The browser sends the exact words the
 * player can read plus the character's voice, and this endpoint returns spoken
 * audio from a neural voice service. The provider key stays on the server; it
 * is never sent to the browser and never appears in a response.
 *
 * PROVIDERS (the first configured one wins):
 *   GEMINI_API_KEY       -> Gemini TTS (prebuilt voices: Kore, Puck, Charon…)
 *   GOOGLE_TTS_API_KEY   -> Google Cloud Text-to-Speech (Neural2/Studio)
 *   ELEVENLABS_API_KEY   -> ElevenLabs (ELEVENLABS_VOICE_ID default voice,
 *                           optional ELEVENLABS_VOICE_MAP JSON {name: voiceId})
 *
 * With no key configured it answers 503 tts-not-configured, and the game falls
 * back to the device voice it already has — nothing goes silent.
 */

const RATE = new Map();
const RATE_LIMIT = 30;          // requests per minute per IP
const MAX_TEXT = 500;

/** Gemini prebuilt voices used by the game. */
const GEMINI_VOICES = [
    'Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr',
    'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
    'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
    'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
    'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'
];

/** Google Cloud TTS voices: our palette name -> a real Cloud voice name. */
const CLOUD_VOICES = {
    Kore: 'en-IN-Neural2-A', Puck: 'en-IN-Neural2-B', Charon: 'en-IN-Neural2-C',
    Fenrir: 'en-IN-Wavenet-D', Aoede: 'en-IN-Wavenet-A', Leda: 'en-GB-Neural2-A',
    Orus: 'en-GB-Neural2-B', Zephyr: 'en-GB-Neural2-C', Callirrhoe: 'en-US-Neural2-D',
    Autonoe: 'en-US-Neural2-F', Enceladus: 'en-US-Neural2-J', Iapetus: 'en-AU-Neural2-A',
    Umbriel: 'en-AU-Neural2-B', Algieba: 'en-GB-Wavenet-D', Despina: 'en-US-Wavenet-H',
    Erinome: 'en-US-Wavenet-K', Algenib: 'en-GB-Wavenet-F', Rasalgethi: 'en-IN-Wavenet-B',
    Laomedeia: 'en-IN-Wavenet-C', Achernar: 'en-US-Studio-M', Alnilam: 'en-US-Studio-O',
    Schedar: 'en-GB-Studio-B', Gacrux: 'en-GB-Studio-C'
};

const pickGeminiVoice = voice => GEMINI_VOICES.includes(voice) ? voice : 'Kore';
const pickCloudVoice = voice => CLOUD_VOICES[voice] || 'en-IN-Neural2-A';

function elevenVoiceMap() {
    try {
        const map = JSON.parse(process.env.ELEVENLABS_VOICE_MAP || '{}');
        return map && typeof map === 'object' ? map : {};
    } catch { return {}; }
}

/** Wrap 16-bit mono PCM in a WAV container the browser can play. */
function pcmToWav(pcm, sampleRate = 24000) {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
}

function rateFor(ip, now) {
    for (const [key, times] of RATE) if (!times.length || now - times.at(-1) >= 60000) RATE.delete(key);
    const bucket = (RATE.get(ip) || []).filter(t => now - t < 60000);
    bucket.push(now);
    RATE.set(ip, bucket);
    return bucket.length <= RATE_LIMIT;
}

async function geminiSpeech(text, voice) {
    const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=' +
        encodeURIComponent(process.env.GEMINI_API_KEY), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: pickGeminiVoice(voice) } } }
            }
        }),
        signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`gemini tts ${response.status}`);
    const data = await response.json();
    const inline = data.candidates?.[0]?.content?.parts?.find(part => part.inlineData)?.inlineData;
    if (!inline?.data) throw new Error('gemini tts empty');
    const pcm = Buffer.from(inline.data, 'base64');
    const rate = Number((inline.mimeType || '').match(/rate=(\d+)/)?.[1] || 24000);
    return { audio: pcmToWav(pcm, rate), type: 'audio/wav' };
}

async function cloudSpeech(text, voice) {
    const response = await fetch(
        'https://texttospeech.googleapis.com/v1/text:synthesize?key=' +
        encodeURIComponent(process.env.GOOGLE_TTS_API_KEY), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            input: { text },
            voice: { languageCode: 'en-IN', name: pickCloudVoice(voice) },
            audioConfig: { audioEncoding: 'MP3', speakingRate: 1, pitch: 0 }
        }),
        signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`cloud tts ${response.status}`);
    const data = await response.json();
    if (!data.audioContent) throw new Error('cloud tts empty');
    return { audio: Buffer.from(data.audioContent, 'base64'), type: 'audio/mpeg' };
}

async function elevenSpeech(text, voice) {
    const id = elevenVoiceMap()[voice] || process.env.ELEVENLABS_VOICE_ID;
    if (!id) throw new Error('elevenlabs voice missing');
    const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(id)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text,
            model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
            voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true }
        }),
        signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) throw new Error(`elevenlabs ${response.status}`);
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) throw new Error('elevenlabs empty');
    return { audio, type: 'audio/mpeg' };
}

module.exports = async function handler(req, res) {
    const origin = req.headers?.origin;
    if (origin === 'https://mahicouragw.github.io' || origin === 'https://black-sold-ultimate.vercel.app') {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Methods', 'POST');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.statusCode = 204;
            return res.end();
        }
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(JSON.stringify({ error: 'POST required' }));
    }

    const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
    const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    const voice = String(body.voice || '').replace(/[^A-Za-z]/g, '').slice(0, 30);
    if (!text) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(JSON.stringify({ error: 'text required' }));
    }

    const ip = (req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0];
    if (!rateFor(ip, Date.now())) {
        res.statusCode = 429;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(JSON.stringify({ error: 'rate limited' }));
    }

    const providers = [];
    if (process.env.GEMINI_API_KEY) providers.push(['gemini', geminiSpeech]);
    if (process.env.GOOGLE_TTS_API_KEY) providers.push(['google', cloudSpeech]);
    if (process.env.ELEVENLABS_API_KEY) providers.push(['elevenlabs', elevenSpeech]);

    if (!providers.length) {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(JSON.stringify({ error: 'tts-not-configured' }));
    }

    for (const [name, call] of providers) {
        try {
            const { audio, type } = await call(text, voice);
            res.statusCode = 200;
            res.setHeader('Content-Type', type);
            res.setHeader('X-Voice-Provider', name);
            res.setHeader('X-Voice-Name', voice || 'default');
            return res.end(audio);
        } catch (error) {
            console.warn(`TTS provider ${name} unavailable: ${error.message}`);
        }
    }

    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'tts-unavailable' }));
};
