import { setTimeout } from "timers/promises";
import DB from "./mongo.mjs";

export default class Basics {
    static async status() {        
        let status = await DB.getStatus();
        if (!status) {
            status = { totalPages: 0, scrapedPages: 0, indexedPages: 0 };
        }
        if (!status.indexedPages) {
            status.indexedPages = 0;
        }

        return status;
    }

    static  getSearchUrl(): string {
        if (!process.env.SEARCH_URL) {
            throw new Error('SEARCH_URL environment variable is not set.');
        }
        return process.env.SEARCH_URL;
    }

    static delay(seconds: number) {
        setTimeout(seconds * 1000);
    }   
    
}