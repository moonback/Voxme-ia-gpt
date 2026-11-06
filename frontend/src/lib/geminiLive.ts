import { supabase } from "./supabase";
import { errorDetails, logConversationEvent, newDiagnosticId } from "./diagnostics";

export type LiveTranscriptSpeaker = "user" | "chloe";

type LiveCallbacks = {
  userId: string;
  sessionId?: string | null;
  onStatus: (status: string) => void;
  onTranscript: (speaker: LiveTranscriptSpeaker, text: string) => void;
  onError: (message: string) => void;
};

export class GeminiLiveAudio {
  private socket: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private mute: GainNode | null = null;
  private playing = new Set<AudioBufferSourceNode>();
  private nextPlayTime = 0;
  private stopped = false;
  private readonly correlationId = newDiagnosticId();
  private currentSessionId: string | null;
  private audioChunksReceived = 0;
  private audioChunksSent = 0;

  private log(event: string, metadata: Record<string, unknown> = {}, level: "debug" | "info" | "warn" | "error" = "info", durationMs?: number) {
    logConversationEvent({ source: "gemini-live", event, level, userId: this.callbacks.userId, sessionId: this.currentSessionId || this.callbacks.sessionId, correlationId: this.correlationId, metadata, durationMs });
  }

  constructor(private callbacks: LiveCallbacks) { this.currentSessionId = callbacks.sessionId || null; }

  setSessionId(sessionId: string) { this.currentSessionId = sessionId; }


  async start() {
    if (!supabase) throw new Error("Supabase n’est pas configuré.");
    this.stopped = false;
    const startedAt = performance.now();
    this.log("live.start.requested");
    this.callbacks.onStatus("Connexion à Gemini Live…");
    const { data: auth, error: authError } = await supabase.auth.getSession();
    if (authError || !auth.session) throw new Error("Connecte-toi à VOXME avant de démarrer le vocal.");
    const tokenResponse = await fetch("/api/live/token", {
      method: "POST",
      headers: { Authorization: `Bearer ${auth.session.access_token}`, "x-request-id": this.correlationId },
    });
    const tokenData = await tokenResponse.json();
    this.log("live.token.response", { httpStatus: tokenResponse.status, ok: tokenResponse.ok });
    if (!tokenResponse.ok) throw new Error(tokenData.error || "Impossible d'obtenir un jeton vocal.");
    const ephemeralToken = String(tokenData.token || "");
    const model = String(tokenData.model || "gemini-3.8-live");
    if (!ephemeralToken) throw new Error("Le serveur n'a pas fourni de jeton Live.");

    this.log("live.websocket.connecting", { model });
    this.socket = new WebSocket(
      `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(ephemeralToken)}`,
    );
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Délai dépassé pendant la connexion Gemini Live.")), 15000);
      this.socket!.onopen = () => {
        this.log("live.websocket.open");
        this.callbacks.onStatus("Initialisation de la session vocale…");
        this.socket!.send(JSON.stringify({
          setup: {
            model: `models/${model}`,
            generationConfig: { responseModalities: ["AUDIO"] },
          },
        }));
      };
      this.socket!.onmessage = (event) => {
        let message: any;
        try { message = JSON.parse(String(event.data)); } catch (error) { this.log("live.websocket.message.parse_failed", { dataType: typeof event.data, ...errorDetails(error) }, "error"); return; }
        if (message.setupComplete) {
          window.clearTimeout(timeout);
          this.log("live.setup.completed", {}, "info", Math.round(performance.now() - startedAt));
          void this.startMicrophone().then(() => { this.log("live.start.completed", { sampleRate: this.audioContext?.sampleRate }, "info", Math.round(performance.now() - startedAt)); resolve(); }).catch(reject);
          return;
        }
        this.handleServerMessage(message);
      };
      this.socket!.onerror = (event) => {
        this.log("live.websocket.error", { eventType: event.type }, "error");
        window.clearTimeout(timeout);
        reject(new Error("La connexion WebSocket Gemini Live a échoué."));
      };
      this.socket!.onclose = (event) => {
        this.log("live.websocket.closed", { code: event.code, reason: event.reason, wasClean: event.wasClean }, this.stopped ? "info" : "error");
        window.clearTimeout(timeout);
        if (!this.stopped) {
          this.callbacks.onStatus("Connexion interrompue");
          this.callbacks.onError("La session vocale a été interrompue. Relance le mode vocal.");
        }
      };
    });
  }

  private async startMicrophone() {
    this.log("live.microphone.permission.requested");
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.log("live.microphone.permission.granted", { trackCount: this.stream.getAudioTracks().length });
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    await this.audioContext.resume();
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.mute = this.audioContext.createGain();
    this.mute.gain.value = 0;
    this.processor.onaudioprocess = (event) => {
      if (this.socket?.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      const ratio = this.audioContext!.sampleRate / 16000;
      const length = Math.floor(input.length / ratio);
      const pcm = new Int16Array(length);
      for (let i = 0; i < length; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.min(input.length, Math.floor((i + 1) * ratio));
        let sum = 0;
        for (let j = start; j < end; j++) sum += input[j];
        const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
        pcm[i] = sample < 0 ? sample * 32768 : sample * 32767;
      }
      this.audioChunksSent++;
      if (this.audioChunksSent === 1 || this.audioChunksSent % 100 === 0) this.log("live.audio.input.progress", { chunksSent: this.audioChunksSent, samples: pcm.length, socketState: this.socket.readyState }, "debug");
      const bytes = new Uint8Array(pcm.buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      this.socket.send(JSON.stringify({
        realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: btoa(binary) } },
      }));
    };
    this.source.connect(this.processor);
    this.processor.connect(this.mute);
    this.mute.connect(this.audioContext.destination);
    this.callbacks.onStatus("VOXME écoute — parle naturellement");
  }

  private handleServerMessage(message: any) {
    if (message.error) {
      this.log("live.server.error", { code: message.error.code || null, status: message.error.status || null, detail: message.error.message || "Gemini Live error" }, "error");
      this.callbacks.onError(String(message.error.message || "Erreur du serveur Gemini Live."));
      return;
    }
    const content = message.serverContent;
    if (!content) {
      this.log("live.server.message.unhandled", { keys: Object.keys(message).slice(0, 12) }, "debug");
      return;
    }
    if (content.inputTranscription?.text) { this.log("live.transcription.input", { chars: String(content.inputTranscription.text).length }, "debug"); this.callbacks.onTranscript("user", String(content.inputTranscription.text)); }
    if (content.outputTranscription?.text) { this.log("live.transcription.output", { chars: String(content.outputTranscription.text).length }, "debug"); this.callbacks.onTranscript("chloe", String(content.outputTranscription.text)); }
    if (content.interrupted) { this.log("live.output.interrupted", { queuedChunks: this.playing.size }, "warn"); this.stopPlayback(); }
    const parts = content.modelTurn?.parts || [];
    for (const part of parts) {
      const encoded = part.inlineData?.data;
      if (encoded && part.inlineData?.mimeType?.startsWith("audio/pcm")) { this.audioChunksReceived++; if (this.audioChunksReceived === 1 || this.audioChunksReceived % 25 === 0) this.log("live.audio.output.progress", { chunksReceived: this.audioChunksReceived, queuedChunks: this.playing.size }, "debug"); this.playPcm(encoded); }
    }
    if (message.goAway) { this.log("live.session.go_away", { timeLeft: message.goAway.timeLeft || null }, "warn"); this.callbacks.onStatus("Renouvellement de connexion requis bientôt"); }
  }

  private playPcm(encoded: string) {
    if (!this.audioContext) return;
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const samples = new Int16Array(bytes.buffer);
    if (samples.length === 0) { this.log("live.audio.output.empty_chunk", {}, "warn"); return; }
    const buffer = this.audioContext.createBuffer(1, samples.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    const node = this.audioContext.createBufferSource();
    node.buffer = buffer;
    node.connect(this.audioContext.destination);
    node.onended = () => this.playing.delete(node);
    const startAt = Math.max(this.audioContext.currentTime + 0.02, this.nextPlayTime);
    node.start(startAt);
    this.nextPlayTime = startAt + buffer.duration;
    this.playing.add(node);
  }

  private stopPlayback() {
    for (const node of this.playing) {
      try { node.stop(); } catch { /* already stopped */ }
    }
    this.playing.clear();
    this.nextPlayTime = this.audioContext?.currentTime || 0;
  }

  async stop() {
    this.log("live.stop.requested", { chunksSent: this.audioChunksSent, chunksReceived: this.audioChunksReceived });
    this.stopped = true;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.mute?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stopPlayback();
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.close(1000, "User stopped session");
    if (this.audioContext && this.audioContext.state !== "closed") await this.audioContext.close();
    this.socket = null; this.stream = null; this.audioContext = null;
    this.processor = null; this.source = null; this.mute = null;
    this.callbacks.onStatus("Vocal arrêté");
    this.log("live.stop.completed", { chunksSent: this.audioChunksSent, chunksReceived: this.audioChunksReceived });
  }
}

