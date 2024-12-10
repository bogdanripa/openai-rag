import DB from "./mongo.mjs";
import OAI from "./openai.mjs";

const oai = new OAI();

async function findRelevantPages(query, topK = 5) {
  try {
    const queryEmbedding = await oai.generateEmbedding(query);
    return await DB.findRelevantPages(queryEmbedding, topK);
  } catch (error) {
    console.error('Error finding relevant pages:', error);
    throw error;
  }
}

export const generateResponse = async (event) => {
  // get the query from the body
  if (!event.body) {
    return {
      statusCode: 204,
    };
  }
  
  const body = JSON.parse(event.body);
  const query = body.query;

  const relevantPages: any[] = await findRelevantPages(query);

  const context = relevantPages
    .map((page) => `URL: ${page.url}\nText: ${page.text}`)
    .join('\n\n------------------------\n\n');
  
  const prompt = `Use the following context to answer the question:\n\n${context}\n\nQuestion: ${query}\nAnswer:`;

  const stream:ReadableStream = await oai.createCompletion(prompt);

  // Use a reader to consume the stream
  let returnBody = '';
  const reader = stream.getReader();
  let done = false;

  // when running locally, genezio does not support streaming, so we'll send the responce at once.
  // but in the cloud event.responseStream is available so we'll use it.

  // list relevant pages
  for (let i=0;i<3 && i<relevantPages.length;i++) {
    const pageUrl = relevantPages[i].url;
    if (event.responseStream)
      event.responseStream.write(`${pageUrl}\n`);
    else
      returnBody += `${pageUrl}\n`;
  }
  if (event.responseStream)
    event.responseStream.write('\n');
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
            if (event.responseStream)
              event.responseStream.write(content);
            else 
              returnBody += content;
      }
  }
  if (event.responseStream)
    event.responseStream.end();
  else  
    return {
      statusCode: 200,
      body: returnBody
    };
}
