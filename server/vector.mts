import DB from "./mongo.mjs";
import OAI from './openai.mjs';
import {Response} from 'express';


export default class Vector {
  static oai: OAI = new OAI();

  static async index(res: Response) {
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
        page.embedding = embedding;
        await page.save();
        console.log(`Saved embedding for page: ${page.url}`);
        await DB.updateIndexingStatus();
        if (true) {
          const status = await DB.getStatus();
          res.write(`i ${status.indexedPages}/${status.totalPages}\n`);
        }
      } catch (error) {
        console.error(`Failed to save embedding for page: ${page.url}`, error);
      }
    }

    console.log("Finished indexing.");
    if (true) {
      const status = await DB.getStatus();
      res.write(`i ${status.indexedPages}/${status.totalPages}\n`);
      res.end();
    } else {
      const status = await DB.getStatus();
      res.send(`i ${status.indexedPages}/${status.totalPages}\n`);
    }
  }
}