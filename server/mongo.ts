import mongoose, { Schema, model } from "mongoose";

interface Page {
    url: string;
    text: string;
    links: string[];
    lastIndexed: Date;
    embedding?: number[];
}
  
const pageSchema = new Schema<Page>({
    url: { type: String, unique: true },
    text: String,
    links: [String],
    lastIndexed: Date,
    embedding: { type: [Number], index: true },
});

interface Status {
    totalPages: number;
    scrapedPages: number;
    indexedPages: number;
}

const statusSchema = new Schema<Status>({
    totalPages: Number,
    scrapedPages: Number,
    indexedPages: Number,
});

export default class DB {
    static pageModel: any|undefined = undefined;
    static statusModel: any|undefined = undefined;
    static connected: boolean = false;

    private static connect() {
      if (!process.env.MY_MONGO_DB_DATABASE_URL) {
        throw new Error("Missing MY_MONGO_DB_DATABASE_URL environment variable");
      }
      mongoose.connect(process.env.MY_MONGO_DB_DATABASE_URL);
    }

    static getPageModel(collectionName: string) {
        if (DB.pageModel) {
            return DB.pageModel;
        }
        if (!DB.connected) {
            DB.connect();
            DB.connected = true;
        }
        DB.pageModel = model<Page>("Page", pageSchema, collectionName);
        return DB.pageModel;
    }

    static getStatusModel(collectionName: string) {
        if (DB.statusModel) {
            return DB.statusModel;
        }
        if (!DB.connected) {
            DB.connect();
            DB.connected = true;
        }
        DB.statusModel = model<Status>("Status", statusSchema, collectionName + "_status");
        return DB.statusModel;
    }

    static async findRelevantPages(collectionName: string, queryEmbedding: any, topK: number) {
        return await DB.getPageModel(collectionName).aggregate([
            {
              $addFields: {
                similarity: {
                  $map: {
                    input: { $range: [0, { $size: "$embedding" }] },
                    as: "idx",
                    in: {
                      $multiply: [
                        { $arrayElemAt: ["$embedding", "$$idx"] },
                        { $arrayElemAt: [queryEmbedding, "$$idx"] }
                      ]
                    }
                  }
                }
              }
            },
            {
              $addFields: {
                similarity: { $sum: "$similarity" }
              }
            },
            { $sort: { similarity: -1 } },
            { $limit: topK }
          ]);
    }

    static async findPages(collectionName: string, query: any) {
        return await this.getPageModel(collectionName).find({ embedding: { $size: 0 } });
    }

    static async findPage(collectionName: string, query: any) {
        return await this.getPageModel(collectionName).findOne(query);
    }

    static async findOneAndUpdate(collectionName: string, url: string, text: string, links: string[], embedding: number[]|undefined=undefined) {
      if (text == '') {
        text = 'nothing, zero, nada';
      }
      return await DB.getPageModel(collectionName).
          findOneAndUpdate(
              { url },
              { url, text, links, lastIndexed: new Date(), embedding },
              { upsert: true }
          )
    }

    static async updateScrapingStatus(collectionName: string, processed: number, from: number) {
      await DB.getStatusModel(collectionName).findOneAndUpdate(
        {},
        { totalPages: from, scrapedPages: processed },
        { upsert: true }
      );
    }

    static async updateIndexingStatus(collectionName: string) {
      const processed = await DB.getPageModel(collectionName).countDocuments({ "embedding.0": { "$exists": true } });
      await DB.getStatusModel(collectionName).findOneAndUpdate(
        {},
        { indexedPages: processed },
        { upsert: true }
      );
    }

    static async getStatus(collectionName: string) {
      return await DB.getStatusModel(collectionName).findOne();
    }
}