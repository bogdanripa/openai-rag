import DB from "./mongo.mjs";
import OAI from './openai.mjs';

const oai = new OAI();

export async function index(event: any) {
  if (event.requestContext.http.method !== 'GET') {
    return {
      statusCode: 204
    }
  }
  console.log("Starting indexing...");
  const pages = await DB.findPages({ embedding: { $size: 0 }});
  console.log(`Found ${pages.length} pages to index.`);

  for (const page of pages) {
    if (!page.text)
      continue;
    try {
      const embedding = await oai.generateEmbedding(page.text);
      page.embedding = embedding;
      await page.save();
      console.log(`Saved embedding for page: ${page.url}`);
      await DB.updateIndexingStatus();
      if (event.responseStream) {
        const status = await DB.getStatus();
        event.responseStream.write(`i ${status.indexedPages}/${status.totalPages}\n`);
      }
    } catch (error) {
      console.error(`Failed to save embedding for page: ${page.url}`, error);
    }
  }

  console.log("Finished indexing.");
  if (event.responseStream) {
    const status = await DB.getStatus();
    event.responseStream.write(`i ${status.indexedPages}/${status.totalPages}\n`);
    event.responseStream.end();
  } else {
    const status = await DB.getStatus();
    return {
      statusCode: 200,
      body: `i ${status.indexedPages}/${status.totalPages}\n`
    }
  }
}