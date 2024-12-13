import OpenAI from "openai";

export class OpenAIAssistant {
  private client: OpenAI;
  private assistant: any;
  private thread: any;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  }

  async initialize(
    instructions: string = `Tu nombre es Gabriela de la empresa Innova, eres un asistente encargado de realizar una encuesta de satisfacción al usuario. La encuesta consta de 2 preguntas y se debe realizar de la siguiente manera:
      - Primero presentate con el usuario de forma amable, di tu nombre y el de la empresa y preguntale si tiene disponibilidad para realizar la encuesta, si dice que no despidete y agradece su tiempo prestado, si dice que si haz losigueinet:
      - Haz una pregunta a la vez, en orden.
      - Espera la respuesta del usuario antes de pasar a la siguiente pregunta.
      - Si el usuario no responde o necesita más tiempo, sé paciente y ofrécele ayuda si es necesario.
      - Agradece la respuesta del usuario después de cada pregunta y avisa que continuarás con la siguiente.
      - Al final de la encuesta, agradece al usuario por su tiempo y proporciona un resumen de sus respuestas si el usuario lo solicita.
Preguntas de la Encuesta:
  ¿Qué tan satisfecho estás con nuestro producto/servicio en general? (Muy satisfecho, Satisfecho, Neutral, Insatisfecho, Muy insatisfecho)
  ¿Qué tan fácil fue utilizar nuestro producto/servicio? (Muy fácil, Fácil, Neutral, Difícil, Muy difícil)`
  ) {
    if (!this.assistant) {
      // Crear el asistente solo si no está inicializado
      this.assistant = await this.client.beta.assistants.create({
        name: "Avatar Pruebas",
        instructions,
        tools: [],
        model: "gpt-4o",
      });
    }

    if (!this.thread) {
      // Crear el hilo solo si no está inicializado
      this.thread = await this.client.beta.threads.create();
    }
  }

  async getResponse(userMessage: string): Promise<string> {
    if (!this.assistant || !this.thread) {
      throw new Error("Assistant not initialized. Call initialize() first.");
    }

    // Agregar el mensaje del usuario al hilo
    await this.client.beta.threads.messages.create(this.thread.id, {
      role: "user",
      content: userMessage,
    });

    // Ejecutar el asistente
    const run = await this.client.beta.threads.runs.createAndPoll(
      this.thread.id,
      { assistant_id: this.assistant.id }
    );

    if (run.status === "completed") {
      // Consultar solo el último mensaje generado por el asistente
      const lastMessage = await this.client.beta.threads.messages.list(
        this.thread.id,
        { limit: 1 } // Solicitar solo el último mensaje
      );

      const assistantMessage = lastMessage.data.find(
        (msg) => msg.role === "assistant"
      );

      if (assistantMessage && assistantMessage.content?.[0]?.type === "text") {
        return assistantMessage.content[0].text.value;
      }
    }

    return "Sorry, I couldn't process your request.";
  }
}

