import DB from "./mongo.mjs";
import OAI from './openai.mjs';
import {Response} from 'express';


export default class Vector {
  static oai: OAI = new OAI();

  static async index(res: Response) {
    const startedAt = new Date().getTime();
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    console.log("Starting indexing...");
    const pages = await DB.findPages({ embedding: { $size: 0 }});
    console.log(`Found ${pages.length} pages to index.`);

    for (const page of pages) {
      if (!page.text)
        continue;
      try {
        const embedding = await Vector.oai.generateEmbedding(page.text);
        await DB.findOneAndUpdate(page.url, undefined, undefined, embedding);
        console.log(`Saved embedding for page: ${page.url}`);
        await DB.updateIndexingStatus();
        const status = await DB.getStatus();
        res.write(`i ${status.indexedPages}/${status.totalPages}\n`);
      } catch (error) {
        console.error(`Failed to save embedding for page: ${page.url}`, error);
      }
      if ((new Date().getTime() - startedAt) > 1000 * 20) {
        console.log("Time limit reached.");
        res.end();
        return;
      }
    }
    console.log("Finished indexing.");
    res.end();
  }
}