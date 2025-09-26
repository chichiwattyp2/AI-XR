import type * as GoogleGenAITypes from '@google/genai';
import * as THREE from 'three';
import * as xb from 'xrblocks';

export interface GeminiManagerEventMap extends THREE.Object3DEventMap {
  inputTranscription: {message: string};
  outputTranscription: {message: string};
  turnComplete: object;
}

export class GeminiManager extends xb.Script<GeminiManagerEventMap> {
  // Core components
  xrDeviceCamera?: xb.XRDeviceCamera;
  ai!: xb.AI;

  // Audio setup
  audioStream: MediaStream|null = null;
  audioContext: AudioContext|null = null;
  sourceNode: MediaStreamAudioSourceNode|null = null;
  processorNode: AudioWorkletNode|null = null;

  // AI state
  isAIRunning: boolean = false;

  // Audio playback setup
  audioQueue: AudioBuffer[] = [];
  isPlayingAudio: boolean = false;

  // Screenshot setInterval identifier
  private screenshotInterval?: ReturnType<typeof setInterval>;

  // Transcription state
  currentInputText: string = '';
  currentOutputText: string = '';

  constructor() {
    super();
  }

  init() {
    this.xrDeviceCamera = xb.core.deviceCamera;
    this.ai = xb.core.ai!;
  }

  async startGeminiLive() {
    if (this.isAIRunning || !this.ai) {
      console.warn('AI already running or not available');
      return;
    }

    try {
      await this.setupAudioCapture();
      await this.startLiveAI();
      this.startScreenshotCapture();
      this.isAIRunning = true;
    } catch (error) {
      console.error('Failed to start Gemini Live:', error);
      this.cleanup();
      throw error;
    }
  }

  async stopGeminiLive() {
    if (!this.isAIRunning) return;

    try {
      if (this.ai && this.ai.stopLiveSession) {
        await this.ai.stopLiveSession();
      }

      this.cleanup();
      this.isAIRunning = false;

      // Clear transcriptions when stopping
      this.currentInputText = '';
      this.currentOutputText = '';
    } catch (error) {
      console.error('Failed to stop Gemini Live:', error);
    }
  }

  async setupAudioCapture() {
    this.audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    const audioTracks = this.audioStream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error('No audio tracks found.');
    }

    this.audioContext = new AudioContext({sampleRate: 16000});
    await this.audioContext.audioWorklet.addModule(
        './AudioCaptureProcessor.js');
    this.sourceNode =
        this.audioContext.createMediaStreamSource(this.audioStream);
    this.processorNode =
        new AudioWorkletNode(this.audioContext, 'audio-capture-processor');
    this.processorNode.port.onmessage = (event) => {
      if (event.data.type === 'audioData' && this.isAIRunning) {
        this.sendAudioData(event.data.data);
      }
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);
  }

  async startLiveAI() {
    return new Promise<void>((resolve, reject) => {
      this.ai.setLiveCallbacks({
        onopen: () => {
          resolve();
        },
        onmessage: (message: GoogleGenAITypes.LiveServerMessage) => {
          this.handleAIMessage(message);
        },
        onerror: (error: ErrorEvent) => {
          console.error('Live AI error:', error);
          reject(error);
        },
        onclose: () => {
          this.isAIRunning = false;
        }
      });

      this.ai.startLiveSession().catch(reject);
    });
  }

  startScreenshotCapture(intervalMs: number = 1000) {
    if (this.screenshotInterval) {
      console.error('Screenshot interval already running');
      return;
    }
    this.screenshotInterval = setInterval(() => {
      this.captureAndSendScreenshot();
    }, intervalMs);
  }

  captureAndSendScreenshot() {
    try {
      const base64Image = this.xrDeviceCamera!.getSnapshot({
        outputFormat: 'base64',
        mimeType: 'image/jpeg',
        quality: 1,
      });
      if (typeof base64Image == 'string') {
        // Strip the data URL prefix if present
        const base64Data = base64Image.startsWith('data:') ?
            base64Image.split(',')[1] :
            base64Image;
        this.sendVideoFrame(base64Data);
      }
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
    }
  }

  sendAudioData(audioBuffer: ArrayBuffer) {
    if (!this.isAIRunning || !this.ai || !this.ai.sendRealtimeInput) {
      throw new Error('AI not ready to send audio clip.');
    }
    try {
      const base64Audio = this.arrayBufferToBase64(audioBuffer);
      this.ai.sendRealtimeInput({
        audio: {data: base64Audio, mimeType: 'audio/pcm;rate=16000'},
      });
    } catch (error) {
      console.error('Failed to send audio:', error);
    }
  }

  sendVideoFrame(base64Image: string) {
    if (!this.isAIRunning || !this.ai || !this.ai.sendRealtimeInput) {
      throw new Error('AI not ready to send video frame');
    }
    try {
      this.ai.sendRealtimeInput({
        video: {data: base64Image, mimeType: 'image/jpeg'},
      });
    } catch (error) {
      console.error('❌ Failed to send video frame:', error);
      console.error('Error stack:', (error as Error).stack);
    }
  }

  async initializeAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({sampleRate: 24000});
    }
  }

  async playAudioChunk(audioData: string) {
    try {
      await this.initializeAudioContext();
      const arrayBuffer = this.base64ToArrayBuffer(audioData);
      const audioBuffer =
          this.audioContext!.createBuffer(1, arrayBuffer.byteLength / 2, 24000);
      const channelData = audioBuffer.getChannelData(0);
      const int16View = new Int16Array(arrayBuffer);

      for (let i = 0; i < int16View.length; i++) {
        channelData[i] = int16View[i] / 32768.0;
      }

      this.audioQueue.push(audioBuffer);

      if (!this.isPlayingAudio) {
        this.playNextAudioBuffer();
      }
    } catch (error) {
      console.error('Error playing audio chunk:', error);
    }
  }

  playNextAudioBuffer() {
    if (this.audioQueue.length === 0) {
      this.isPlayingAudio = false;
      return;
    }

    this.isPlayingAudio = true;
    const audioBuffer = this.audioQueue.shift();
    const source = this.audioContext!.createBufferSource();
    source.buffer = audioBuffer!;
    source.connect(this.audioContext!.destination);

    source.onended = () => {
      this.playNextAudioBuffer();
    };

    source.start();
  }

  cleanup() {
    if (this.screenshotInterval) {
      clearInterval(this.screenshotInterval);
      this.screenshotInterval = undefined;
    }

    // Clear audio queue and stop playback
    this.audioQueue = [];
    this.isPlayingAudio = false;

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
  }

  handleAIMessage(message: GoogleGenAITypes.LiveServerMessage) {
    if (message.data) {
      this.playAudioChunk(message.data);
    }

    if (message.serverContent) {
      if (message.serverContent.inputTranscription) {
        const text = message.serverContent.inputTranscription.text;
        if (text) {
          this.dispatchEvent({type: 'inputTranscription', message: text});
        }
      }
      if (message.serverContent.outputTranscription) {
        const text = message.serverContent.outputTranscription.text;
        if (text) {
          this.dispatchEvent({type: 'outputTranscription', message: text});
        }
      }

      if (message.serverContent.turnComplete) {
        this.dispatchEvent({type: 'turnComplete'});
      }
    }
  }

  arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  dispose() {
    this.cleanup();
    super.dispose();
  }
}
