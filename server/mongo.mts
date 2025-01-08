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

    private static getCollectionName():string {
      let cName = '';
      if (process.env.COLLECTION_NAME) {
        cName = process.env.COLLECTION_NAME.replace(/[^a-z]/gi, '-');
      } else {
        cName = process.env.SEARCH_URL?.replace(/^.*:\/\//, '').replace(/\//g, '').replace(/[^a-z]/gi, '-') || 'pages';
      }
      return cName;
    }

    static getPageModel() {
        if (DB.pageModel) {
            return DB.pageModel;
        }
        if (!DB.connected) {
            DB.connect();
            DB.connected = true;
        }
        DB.pageModel = model<Page>("Page", pageSchema, DB.getCollectionName());
        return DB.pageModel;
    }

    static getStatusModel() {
        if (DB.statusModel) {
            return DB.statusModel;
        }
        if (!DB.connected) {
            DB.connect();
            DB.connected = true;
        }
        DB.statusModel = model<Status>("Status", statusSchema, DB.getCollectionName() + "_status");
        return DB.statusModel;
    }

    static async findRelevantPages(queryEmbedding: any, topK: number) {
        return await DB.getPageModel().aggregate([
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

    static async findPages(query: any) {
        return await this.getPageModel().find(query);
    }

    static async findPage(query: any) {
        return await this.getPageModel().findOne(query);
    }

    static async findOneAndUpdate(url: string, text: string|undefined, links: string[]|undefined, embedding: number[]|undefined=undefined) {
      const val:any = {
        url,
        lastIndexed: new Date()
      };

      if (text) val.text = text;
      if (links) val.links = links;
      if (embedding) val.embedding = embedding;

      return await DB.getPageModel().
          findOneAndUpdate(
              { url },
              val,
              { upsert: true }
          )
    }

    static async updateScrapingStatus(processed: number, from: number) {
      await DB.getStatusModel().findOneAndUpdate(
        {},
        { totalPages: from, scrapedPages: processed },
        { upsert: true }
      );
    }

    static async updateIndexingStatus() {
      const processed = await DB.getPageModel().countDocuments({ "embedding.0": { "$exists": true } });
      await DB.getStatusModel().findOneAndUpdate(
        {},
        { indexedPages: processed },
        { upsert: true }
      );
    }

    static async getStatus() {
      return await DB.getStatusModel().findOne();
    }
}