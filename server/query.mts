import DB from "./mongo.mjs";
import OAI from "./openai.mjs";
import {Response} from 'express';

export default class Query {
  static oai:OAI = new OAI();

  private static async findRelevantPages(query: string, topK = 5) {
    try {
      const queryEmbedding = await Query.oai.generateEmbedding(query);
      return await DB.findRelevantPages(queryEmbedding, topK);
    } catch (error) {
      console.error('Error finding relevant pages:', error);
      return [];
    }
  }

  static async search (query: string, res: Response) {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    const relevantPages: any[] = await Query.findRelevantPages(query);

    const context = relevantPages
      .map((page) => `URL: ${page.url}\nText: ${page.text}`)
      .join('\n\n------------------------\n\n');
    
    const prompt = `Use the following context to answer the question:\n\n${context}\n\nQuestion: ${query}\nAnswer:`;

    const stream:ReadableStream = await Query.oai.createCompletion(prompt);

    // Use a reader to consume the stream
    let returnBody = '';
    const reader = stream.getReader();
    let done = false;

    // when running locally, genezio does not support streaming, so we'll send the responce at once.
    // but in the cloud event.responseStream is available so we'll use it.

    // list relevant pages
    for (let i=0;i<3 && i<relevantPages.length;i++) {
      const pageUrl = relevantPages[i].url;
      if (true)
        res.write(`${pageUrl}\n`);
      else
        returnBody += `${pageUrl}\n`;
    }
    if (true)
      res.write('\n');
    else
      returnBody += '\n';

    while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
            const chunk = new TextDecoder().decode(value);
            const parsed = JSON.parse(chunk);

            // Extract the content
            const content = parsed.choices?.[0]?.delta?.content;
            if (content)
              if (true)
                res.write(content);
              else 
                returnBody += content;
        }
    }
    if (true)
      res.end();
    else  
      res.send(returnBody);
  }
}