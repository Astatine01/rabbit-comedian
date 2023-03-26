import QRCode from "qrcode";
import { WechatyBuilder } from "wechaty"; 
import { ajax, ChatGPTBot } from "./chatgpt.js";
import { Config } from "./config.js";
// import express, { Request, Response } from 'express';
// import cors from 'cors';
// import helmet from 'helmet';

// const app: express.Application = express();
 
// app.use(express.json());
// app.use(cors());
// app.use(helmet());

// Wechaty instance
const weChatBot = WechatyBuilder.build({
  name: "my-wechat-bot",
});
// ChatGPTBot instance
const chatGPTBot = new ChatGPTBot();



async function main() {

  // app.post('/createChat', async (req: Request, resp: Response) => {

  //   req.accepts('application/json');
  //   console.log(req.header('Authorization'));
  //   console.log(req.body.Item); // I get the data
  //   const response = await chatGPTBot.createChatCompletion(req.body);
  //   resp.send(response);
  // }).listen(3000,() => {
  //   console.log('ts-express启动成功 port:3000')
  // });
   


  weChatBot
    // scan QR code for login
    .on("scan", async (qrcode, status) => {
      const surl = `https://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}`;
      if(Config.loginHook.startsWith("http")){
        ajax({
          type : 'POST',
          data : "{\"msgtype\":\"template_card\",\"template_card\":{\"card_type\":\"text_notice\",\"source\":{\"icon_url\":\"https://wework.qpic.cn/wwpic/252813_jOfDHtcISzuodLa_1629280209/0\",\"desc\":\"企业微信\",\"desc_color\":0},\"main_title\":{\"title\":\"rabbito登录认证\",\"desc\":\"rabbito正在进行登录操作\"},\"card_action\":{\"type\":1,\"url\":\"" + `${surl}` + "\",\"appid\":\"APPID\",\"pagepath\":\"PAGEPATH\"}}}",
          url : Config.loginHook,
          dataType : 'json'
      });
      }
      console.log(`💡 Scan QR Code to login: ${status}\n${surl}`);
      console.log(
        await QRCode.toString(qrcode, { type: "terminal", small: true })
      );
    })
    // login to WeChat desktop account
    .on("login", async (user: any) => {
      console.log(`✅ User ${user} has logged in`);
      chatGPTBot.setBotName(user.name());
      await chatGPTBot.startGPTBot();
    })
    // message handler
    .on("message", async (message: any) => {
      try {
        console.log(`📨 ${message}`);
        // add your own task handlers over here to expand the bot ability!
        // e.g. if a message starts with "Hello", the bot sends "World!"
        if (message.text().startsWith("Hello")) {
          await message.say("World!");
          return;
        } 
        // handle message for chatGPT bot
        await chatGPTBot.onMessage(message);
      } catch (e) {
        console.error(`❌ ${e}`);
      }
    });

  try {
    await weChatBot.start();
  } catch (e) {
    console.error(`❌ Your Bot failed to start: ${e}`);
    console.log(
      "🤔 Can you login WeChat in browser? The bot works on the desktop WeChat"
    );
  }
}
main();
