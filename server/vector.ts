import { GenezioDeploy } from "@genezio/types";
import DB from "./mongo.mjs";
import OAI from './openai.mjs';

@GenezioDeploy()
export class Vector {
  oai: OAI;

  constructor() {
    this.oai = new OAI();
  }

  async saveEmbeddings() {
    const pages = await DB.findPages({ embedding: { $size: 0 }});

    for (const page of pages) {
      if (!page.text)
        continue;
  
      try {
        const embedding = await this.oai.generateEmbedding(page.text);
        page.embedding = embedding;
        await page.save();
        console.log(`Saved embedding for page: ${page.url}`);
        await DB.updateIndexingStatus();
      } catch (error) {
        console.error(`Failed to save embedding for page: ${page.url}`, error);
      }
    }
    await DB.updateIndexingStatus();
  }
}