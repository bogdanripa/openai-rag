import { GenezioDeploy } from "@genezio/types";
import DB from "./mongo";
import OAI from './openai';

@GenezioDeploy()
export class Query {
  oai: OAI;

  constructor() {
    this.oai = new OAI();
  }

  // Find the most relevant pages based on a query
  private async findRelevantPages (query: string, topK:number = 5): Promise<any[]> {
    try {
      const queryEmbedding = await this.oai.generateEmbedding(query);
      return await DB.findRelevantPages(queryEmbedding, topK);
    } catch (error) {
      console.error('Error finding relevant pages:', error);
      throw error;
    }
  }

  async generateResponse (query: string): Promise<any> {
    const relevantPages = await this.findRelevantPages(query);

    const context = relevantPages
      .map((page:any) => `URL: ${page.url}\nText: ${page.text}`)
      .join('\n\n------------------------\n\n');
  
    const prompt = `Use the following context to answer the question:\n\n${context}\n\nQuestion: ${query}\nAnswer:`;

    return {
        response: await this.oai.createCompletion(prompt),
        links: relevantPages.slice(0, 3).map((page:any) => page.url)
    };
  }
}