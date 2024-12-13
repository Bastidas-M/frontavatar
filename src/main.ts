import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskType,
  VoiceEmotion
} from "@heygen/streaming-avatar";

import { OpenAIAssistant } from "./openai-assistant";
import { io } from "socket.io-client";

// STT Socket.io Configuration
const socket = io("http://localhost:5000");//io("https://6545-201-212-29-90.ngrok-free.app");//const socket = io("http://localhost:5000");

// DOM elements
const videoElement = document.getElementById("avatarVideo") as HTMLVideoElement;
const startButton = document.getElementById(
  "startSession"
) as HTMLButtonElement;
const endButton = document.getElementById("endSession") as HTMLButtonElement;

let avatar: StreamingAvatar | null = null;
let sessionData: any = null;
let openaiAssistant: OpenAIAssistant | null = null;

// STT Configuration
let audioContext: AudioContext;
let analyser: AnalyserNode;
let source: MediaStreamAudioSourceNode;
let dataArray: Uint8Array;
let isSpeaking = false;
let mediaRecorder: MediaRecorder | null = null;
const VOLUME_THRESHOLD = 90; // Threshold for detecting speech
let silenceTimeout: NodeJS.Timeout | null = null; // Temporizador para detectar silencio
const SILENCE_DELAY = 1500; // 2 segundos en milisegundos

// Helper function to fetch access token
async function fetchAccessToken(): Promise<string> {
  const apiKey = import.meta.env.VITE_HEYGEN_API_KEY;
  const response = await fetch(
    "https://api.heygen.com/v1/streaming.create_token",
    {
      method: "POST",
      headers: { "x-api-key": apiKey },
    }
  );

  const { data } = await response.json();
  return data.token;
}

// Initialize streaming avatar session
async function initializeAvatarSession() {
  startButton.disabled = true;

  try {
    const token = await fetchAccessToken();
    avatar = new StreamingAvatar({ token });

    const openaiApiKey = import.meta.env.VITE_OPENAI_API_KEY;
    openaiAssistant = new OpenAIAssistant(openaiApiKey);

    await openaiAssistant.initialize();

    sessionData = await avatar.createStartAvatar({
      quality: AvatarQuality.Medium,
      avatarName: "Elenora_IT_Sitting_public", // Avatar ID Anna_public_3_20240108
      voice: {
        voiceId: "49e3e441c5874cbab3a9e8086b927e8b",
        rate: 1.0, // 0.5 ~ 1.5
        emotion: VoiceEmotion.EXCITED,
      },
      language: "Spanish",
    });

    endButton.disabled = false;


    /*avatar.on(StreamingEvents.STREAM_READY, () => {
      handleStreamReady();
      startVoiceDetection(); // Iniciar captura de voz cuando el avatar esté listo
    });*/

    avatar.on(StreamingEvents.STREAM_READY, handleStreamReady);
    avatar.on(StreamingEvents.STREAM_DISCONNECTED, handleStreamDisconnected);

  } catch (error) {
    console.error("Failed to initialize avatar session:", error);
    startButton.disabled = false;
  }
}

// Handle when avatar stream is ready
function handleStreamReady(event: any) {
  if (event.detail && videoElement) {
    videoElement.srcObject = event.detail;
    videoElement.onloadedmetadata = () => {
      videoElement.play().catch(console.error);
    };
    //("Avatar is ready!");
    startVoiceDetection();
  } else {
    console.error("Stream is not available");
  }
}

// Handle stream disconnection
function handleStreamDisconnected() {
  //console.log("Stream disconnected");
  if (videoElement) {
    videoElement.srcObject = null;
  }

  startButton.disabled = false;
  endButton.disabled = true;
}

// End the avatar session
async function terminateAvatarSession() {
  if (!avatar || !sessionData) return;

  await avatar.stopAvatar();
  videoElement.srcObject = null;
  avatar = null;
}

// Initialize STT Voice Detection
async function startVoiceDetection() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  audioContext = new AudioContext();
  source = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();

  analyser.fftSize = 512;
  dataArray = new Uint8Array(analyser.frequencyBinCount);
  source.connect(analyser);

  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      const reader = new FileReader();
      reader.readAsArrayBuffer(event.data);
      console.log("solicitud backend");
      reader.onloadend = () => {
        socket.emit("audio_chunk", reader.result); // Send the audio chunk to the backend
      };
    }
  };

  detectSpeech(); // Start detecting speech
}

// Speech detection based on volume
function detectSpeech() {
  analyser.getByteFrequencyData(dataArray);

  const averageVolume =
    dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;

  if (averageVolume > VOLUME_THRESHOLD) {
    if (!isSpeaking) {
      isSpeaking = true;
      //console.log("Hablando detectado...");
      if (mediaRecorder && mediaRecorder.state !== "recording") {
        mediaRecorder.start();
      }
    }

    // Reiniciar temporizador de silencio si se detecta voz
    if (silenceTimeout) {
      clearTimeout(silenceTimeout);
      silenceTimeout = null;
    }
  } else {
    if (isSpeaking && !silenceTimeout) {
      // Iniciar temporizador para detener grabación si no hay voz
      silenceTimeout = setTimeout(() => {
        isSpeaking = false;
        //console.log("Pausa detectada...");
        if (mediaRecorder && mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
        silenceTimeout = null;
      }, SILENCE_DELAY);
    }
  }

  requestAnimationFrame(detectSpeech);
}

// Handle transcription from the backend
socket.on("transcription", (data: { text: string }) => {
  console.log("Responde backend",data.text);
  if (data.text && data.text.trim() !== "") {
    handleSpeak(data.text); // Send transcribed text to OpenAI and Avatar
  }
});

socket.on("error", (data: { message: string }) => {
  console.error("Error:", data.message);
});

// Handle speaking event
async function handleSpeak(transcribedText: string) {
  console.log("solicitud_openai")
  if (avatar && openaiAssistant && transcribedText) {
    try {
      const response = await openaiAssistant.getResponse(transcribedText);
      console.log('Respuesta OpenAI',response);
      console.log('Solicitud HeyGen');
      const responseHG = await avatar.speak({
        text: response,
        task_type: TaskType.REPEAT,
      });
      console.log('Respuesta HeyGen',responseHG);
    } catch (error) {
      console.error("Error getting response:", error);
    }
  }
}

// Event listeners for buttons
startButton.addEventListener("click", initializeAvatarSession);
endButton.addEventListener("click", terminateAvatarSession);
