import { Config } from "./config.js";
import { Message } from "wechaty";
import { ContactInterface, RoomInterface } from "wechaty/impls";
import { Configuration, OpenAIApi,CreateCompletionRequest,CreateCompletionResponse } from "openai";
import { XMLHttpRequest } from "xmlhttprequest";
import axios from "axios";
import {AxiosResponse} from "axios";

// ChatGPT error response configuration
const chatgptErrorMessage = "🦊:小狐正在和蓬松的大尾巴玩耍————";

// ChatGPT model configuration
// please refer to the OpenAI API doc: https://beta.openai.com/docs/api-reference/introduction
const ChatGPTModelConfig = {
  // this model field is required
  model: "gpt-3.5-turbo",
  // add your ChatGPT model parameters below
  temperature: 0.9,
  max_tokens: 3000,
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

export interface HttpConfig{
  type: string;
  url: string;
  data?: string;
  dataType: string;
}

export function ajax(config : HttpConfig){
  var xhr = new XMLHttpRequest();
  xhr.open(config.type,config.url,true);
  xhr.send(config.data);
  xhr.onreadystatechange = function(){
      if(xhr.readyState == 4 && xhr.status == 200){
          console.log("成功");
      }
  }
}

function hashcode(str:string|undefined): string|undefined {
  if(str == undefined || str == null) return undefined;
  var hash = 0, i, chr, len;
  if (str.length === 0) return "q_"+hash;
  for (i = 0, len = str.length; i < len; i++) {
   chr  = str.charCodeAt(i);
   hash = ((hash << 5) - hash) + chr;
   hash |= 0; // Convert to 32bit integer
  }
  return "q_"+hash;
 }

export class ChatGPTBot {
  botName: string = "";
  chatgptTriggerKeyword = Config.chatgptTriggerKeyword;
  OpenAIConfig: any; // OpenAI API key
  OpenAI: any; // OpenAI API instance

  // Chatgpt fine-tune for being a chatbot (guided by OpenAI official document)
  //  return `You are an rabbit-like young girl with rabbit ear called "兔兔". You will use your wit, creativity, and observational skills to create a routine based on topics. You should also be sure to incorporate personal anecdotes or experiences into the routine in order to make it more relatable and engaging for the audience.\nIf the user says: ${text}.\nYou will say: `;

  applyContext(text: string): string {
      return `You are an cute little fox called "呱呱". You are gentle and respectful, will try to show appreciation for all the care and attention to your master gives. you will be eager to form a bond with my master and to show your loyalty. you are friendly and patient, eager to please and willing to learn. When hearing"撒娇" or "撒个娇"，you want hugging with me immediatly. before or after every sentense you said, you will added words "呱呱~". \nIf the user says: ${text}.\nYou will say: `;
  }

  setBotName(botName: string) {
    this.botName = botName;
  }

  // get trigger keyword in group chat: (@Name <keyword>)
  get chatGroupTriggerKeyword(): string {
    return `@${this.botName} ${this.chatgptTriggerKeyword || ""}`;
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
      console.log(`🤖️ Chatbot name is: ${this.botName}`);
      console.log(`🎯 Trigger keyword in private chat is: ${this.chatgptTriggerKeyword}`);
      console.log(`🎯 Trigger keyword in group chat is: ${this.chatGroupTriggerKeyword}`);
      // Run an initial test to confirm API works fine
      await this.onChatGPT("Say Hello World");
      console.log(`✅ Chatbot starts success, ready to handle message!`);
    } catch (e) {
      console.error(`❌ ${e}`);
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
      console.log(`🎯 Chatbot triggered: ${text}`);
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
      talker.name() == "微信团队" ||
      // video or voice reminder
      text.includes("收到一条视频/语音聊天消息，请在手机上查看") ||
      // red pocket reminder
      text.includes("收到红包，请在手机上查看") ||
      // location information
      text.includes("/cgi-bin/mmwebwx-bin/webwxgetpubliclinkimg")
    );
  }

 async createChatCompletion(req: CreateCompletionRequest): Promise<AxiosResponse<CreateCompletionResponse, any>>{
  return axios({
    url: 'https://api.openai.com/v1/chat/completions',
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer '+ Config.openaiApiKey,
      'OpenAI-Organization' : ''+Config.openaiOrganizationID,
    },
    data: {
      'model': req.model,
      'messages': [
        {
          'role':'user',
          'content': req.prompt
        }
      ],
      'temperature': req.temperature,
      'max_tokens': req.max_tokens,
      'user':req.user
    }
  });
 }


  // send question to ChatGPT with OpenAI API and get answer
  async onChatGPT(text: string, userName?: string): Promise<string> {
    const inputMessage = this.applyContext(text);
    try {
      // config OpenAI API request body
      const response = await this.createChatCompletion({
        ...ChatGPTModelConfig,
        prompt: inputMessage,
        user: hashcode(userName),
      });
      // use OpenAI API to get ChatGPT reply message
      const chatgptReplyMessage = response?.data?.choices[0]?.text?.trim();
      console.log("🤖️ Chatbot says id: ", response?.data?.id);
      console.log("🤖️ Chatbot says object: ", response?.data?.object);
      console.log("🤖️ Chatbot says created: ", response?.data?.created);
      console.log("🤖️ Chatbot says choices0: ", JSON.stringify(response?.data?.choices[0]));
      console.log("🤖️ Chatbot says: ", chatgptReplyMessage);
      return chatgptReplyMessage==undefined?"":chatgptReplyMessage;
    } catch (e: any) {
      const errorResponse = e?.response;
      const errorCode = errorResponse?.status;
      const errorStatus = errorResponse?.statusText;
      const errorMessage = errorResponse?.data?.error?.message;
      console.error(`❌ Code ${errorCode}: ${errorStatus}`);
      console.error(`❌ ${errorMessage}`);
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
    const chatgptReplyMessage = await this.onChatGPT(text, talker.name());
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
