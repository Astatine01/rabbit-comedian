import { Config } from "./config.js";
import { Message } from "wechaty";
import { ContactInterface, RoomInterface } from "wechaty/impls";
import { Configuration, OpenAIApi } from "openai";

// ChatGPT error response configuration
const chatgptErrorMessage = "π¦:ε°ηζ­£ε¨εθ¬ζΎηε€§ε°Ύε·΄η©θββββ";

// ChatGPT model configuration
// please refer to the OpenAI API doc: https://beta.openai.com/docs/api-reference/introduction
const ChatGPTModelConfig = {
  // this model field is required
  model: "text-davinci-003",
  // add your ChatGPT model parameters below
  temperature: 0.9,
  max_tokens: 3700,
};

// message size for a single reply by the bot
const SINGLE_MESSAGE_MAX_SIZE = 500;

enum MessageType {
  Unknown = 0,
  Attachment = 1, // Attach(6),
  Audio = 2, // Audio(1), Voice(34)
  Contact = 3, // ShareCard(42)
  ChatHistory = 4, // ChatHistory(19)
  Emoticon = 5, // Sticker: Emoticon(15), Emoticon(47)
  Image = 6, // Img(2), Image(3)
  Text = 7, // Text(1)
  Location = 8, // Location(48)
  MiniProgram = 9, // MiniProgram(33)
  GroupNote = 10, // GroupNote(53)
  Transfer = 11, // Transfers(2000)
  RedEnvelope = 12, // RedEnvelopes(2001)
  Recalled = 13, // Recalled(10002)
  Url = 14, // Url(5)
  Video = 15, // Video(4), Video(43)
  Post = 16, // Moment, Channel, Tweet, etc
}

export class ChatGPTBot {
  botName: string = "";
  chatgptTriggerKeyword = Config.chatgptTriggerKeyword;
  OpenAIConfig: any; // OpenAI API key
  OpenAI: any; // OpenAI API instance

  // Chatgpt fine-tune for being a chatbot (guided by OpenAI official document)
  //  return `You are an rabbit-like young girl with rabbit ear called "εε". You will use your wit, creativity, and observational skills to create a routine based on topics. You should also be sure to incorporate personal anecdotes or experiences into the routine in order to make it more relatable and engaging for the audience.\nIf the user says: ${text}.\nYou will say: `;

  applyContext(text: string): string {
      return `You are an cute little fox called "ε±ε±". You are gentle and respectful, will try to show appreciation for all the care and attention to your master gives. you will be eager to form a bond with my master and to show your loyalty. you are friendly and patient, eager to please and willing to learn. When hearing"ζε¨" or "ζδΈͺε¨"οΌyou want hugging with me immediatly. before or after every sentense you said, you will added words "ε±ε±~". \nIf the user says: ${text}.\nYou will say: `;
  }

  setBotName(botName: string) {
    this.botName = botName;
  }

  // get trigger keyword in group chat: (@Nameβ<keyword>)
  get chatGroupTriggerKeyword(): string {
    return `@${this.botName}β${this.chatgptTriggerKeyword || ""}`;
  }

  // configure API with model API keys and run an initial test
  async startGPTBot() {
    try {
      // OpenAI Account configuration
      this.OpenAIConfig = new Configuration({
        organization: Config.openaiOrganizationID,
        apiKey: Config.openaiApiKey,
      });
      // OpenAI API instance
      this.OpenAI = new OpenAIApi(this.OpenAIConfig);
      // Hint user the trigger keyword in private chat and group chat
      console.log(`π€οΈ Chatbot name is: ${this.botName}`);
      console.log(`π― Trigger keyword in private chat is: ${this.chatgptTriggerKeyword}`);
      console.log(`π― Trigger keyword in group chat is: ${this.chatGroupTriggerKeyword}`);
      // Run an initial test to confirm API works fine
      await this.onChatGPT("Say Hello World");
      console.log(`β Chatbot starts success, ready to handle message!`);
    } catch (e) {
      console.error(`β ${e}`);
    }
  }

  // get clean message by removing reply separater and group mention characters
  cleanMessage(rawText: string, isPrivateChat: boolean = false): string {
    let text = rawText;
    const item = rawText.split("- - - - - - - - - - - - - - -");
    if (item.length > 1) {
      text = item[item.length - 1];
    }
    text = text.replace(
      isPrivateChat ? this.chatgptTriggerKeyword : this.chatGroupTriggerKeyword,
      ""
    );
    return text;
  }

  // check whether ChatGPT bot can be triggered
  triggerGPTMessage(text: string, isPrivateChat: boolean = false): boolean {
    const chatgptTriggerKeyword = this.chatgptTriggerKeyword;
    let triggered = false;
    if (isPrivateChat) {
      triggered = chatgptTriggerKeyword
        ? text.startsWith(chatgptTriggerKeyword)
        : true;
    } else {
      triggered = text.startsWith(this.chatGroupTriggerKeyword);
    }
    if (triggered) {
      console.log(`π― Chatbot triggered: ${text}`);
    }
    return triggered;
  }

  // filter out the message that does not need to be processed
  isNonsense(
    talker: ContactInterface,
    messageType: MessageType,
    text: string
  ): boolean {
    return (
      // self-chatting can be used for testing
      talker.self() ||
      messageType > MessageType.GroupNote ||
      talker.name() == "εΎ?δΏ‘ε’ι" ||
      // video or voice reminder
      text.includes("ζΆε°δΈζ‘θ§ι’/θ―­ι³θε€©ζΆζ―οΌθ―·ε¨ζζΊδΈζ₯η") ||
      // red pocket reminder
      text.includes("ζΆε°ηΊ’εοΌθ―·ε¨ζζΊδΈζ₯η") ||
      // location information
      text.includes("/cgi-bin/mmwebwx-bin/webwxgetpubliclinkimg")
    );
  }

  // send question to ChatGPT with OpenAI API and get answer
  async onChatGPT(text: string): Promise<string> {
    const inputMessage = this.applyContext(text);
    try {
      // config OpenAI API request body
      const response = await this.OpenAI.createCompletion({
        ...ChatGPTModelConfig,
        prompt: inputMessage,
      });
      // use OpenAI API to get ChatGPT reply message
      const chatgptReplyMessage = response?.data?.choices[0]?.text?.trim();
      console.log("π€οΈ Chatbot says: ", chatgptReplyMessage);
      return chatgptReplyMessage;
    } catch (e: any) {
      const errorResponse = e?.response;
      const errorCode = errorResponse?.status;
      const errorStatus = errorResponse?.statusText;
      const errorMessage = errorResponse?.data?.error?.message;
      console.error(`β Code ${errorCode}: ${errorStatus}`);
      console.error(`β ${errorMessage}`);
      return chatgptErrorMessage;
    }
  }

  // reply with the segmented messages from a single-long message
  async reply(
    talker: RoomInterface | ContactInterface,
    mesasge: string
  ): Promise<void> {
    const messages: Array<string> = [];
    let message = mesasge;
    while (message.length > SINGLE_MESSAGE_MAX_SIZE) {
      messages.push(message.slice(0, SINGLE_MESSAGE_MAX_SIZE));
      message = message.slice(SINGLE_MESSAGE_MAX_SIZE);
    }
    messages.push(message);
    for (const msg of messages) {
      await talker.say(msg);
    }
  }

  // reply to private message
  async onPrivateMessage(talker: ContactInterface, text: string) {
    // get reply from ChatGPT
    const chatgptReplyMessage = await this.onChatGPT(text);
    // send the ChatGPT reply to chat
    await this.reply(talker, chatgptReplyMessage);
  }

  // reply to group message
  async onGroupMessage(room: RoomInterface, text: string) {
    // get reply from ChatGPT
    const chatgptReplyMessage = await this.onChatGPT(text);
    // the reply consist of: original text and bot reply
    const result = `${text}\n ---------- \n ${chatgptReplyMessage}`;
    await this.reply(room, result);
  }

  // receive a message (main entry)
  async onMessage(message: Message) {
    const talker = message.talker();
    const rawText = message.text();
    const room = message.room();
    const messageType = message.type();
    const isPrivateChat = !room;
    // do nothing if the message:
    //    1. is irrelevant (e.g. voice, video, location...), or
    //    2. doesn't trigger bot (e.g. wrong trigger-word)
    if (
      this.isNonsense(talker, messageType, rawText) ||
      !this.triggerGPTMessage(rawText, isPrivateChat)
    ) {
      return;
    }
    // clean the message for ChatGPT input
    const text = this.cleanMessage(rawText, isPrivateChat);
    // reply to private or group chat
    if (isPrivateChat) {
      return await this.onPrivateMessage(talker, text);
    } else {
      return await this.onGroupMessage(room, text);
    }
  }
}
