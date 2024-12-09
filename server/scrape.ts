import { GenezioDeploy } from "@genezio/types";
import { JSDOM } from "jsdom";
import { setTimeout } from "timers/promises";
import DB from "./mongo";

@GenezioDeploy()
export class Scrape {
  private extractFolderAfterDomain(url: string): string | null {
    try {
      const parsedUrl = new URL(url); // Use the URL constructor to parse the URL
      const pathname = parsedUrl.pathname; // Get the pathname part of the URL
      const segments = pathname.split('/').filter(segment => segment.length > 0); // Split and filter out empty segments
      return segments.length > 0 ? `/${segments[0]}/` : null; // Return the first segment with slashes
    } catch (error) {
      console.error('Invalid URL:', error);
      return null;
    }
  }

  private extractLinks(html: string, baseUrl: string, pathFilter: string): string[] {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const links = Array.from(document.querySelectorAll("a[href]"))
      .map((anchor: any) => {
        try {
          return new URL(anchor.getAttribute("href")!, baseUrl).href.replace(/#.*$/, "");
        } catch (error) {
          console.warn(`Malformed URL skipped: ${anchor.getAttribute("href")}`);
          return null;
        }
      })
      .filter((url): url is string => url !== null && url.startsWith(baseUrl) && url.includes(pathFilter));

    // Extract links from window.location assignments
    const scriptLinks = Array.from(document.querySelectorAll("script"))
      .map((script: any) => {
        try {
          const match = script.textContent?.match(/window\.location\s*=\s*['"](.*?)['"]/);
          return match ? new URL(match[1], baseUrl).href.replace(/#.*$/, "") : null;
        } catch (error) {
          console.warn(`Malformed window.location URL skipped in script.`);
          return null;
        }
      })
      .filter((url): url is string => url !== null);

    return Array.from(new Set([...links, ...scriptLinks]));
  }

  private extractText (html: string): string {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Remove <script> and <style> elements
    document.querySelectorAll("script, style").forEach((el) => el.remove());

    // Extract and return the text content of the body
    return document.body.textContent?.trim() || "";
  }

  private delay(seconds: number) {
    setTimeout(seconds * 1000);
  }

  // Main Scraper Function
  async scrape() {
    const startUrl = process.env.SEARCH_URL || 'https://genezio.com/docs/';
    const parallelRequests: number = 10;
    const delaySeconds: number = 1;
    const ageDays: number = 7;

    console.log(`Starting scrapeing ${startUrl}`);
    const pathFilter = this.extractFolderAfterDomain(startUrl) || "/";
    const cacheThreshold = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
    const visited = new Set<string>();
    let totalPages = 1;
    const queue: string[] = [startUrl];

    const processUrl = async (url: string): Promise<boolean> => {
      const existingPage = await DB.findPage({ url });
      const isCached = existingPage && existingPage.lastIndexed > cacheThreshold;
      
      if (isCached) {
        console.log(`Skipping up-to-date cached page: ${url}`);
        existingPage?.links.forEach((link: string) => {
          if (!visited.has(link) && !queue.includes(link)) {
            queue.push(link);
            totalPages++;
          }
        });
        return false;
      }
      
      console.log(`Fetching new page: ${url}`);
      let html = '';
      try {
        const response = await fetch(url);
        if (!response.ok) {
          html = response.statusText;
        } else {
          html = await response.text();
        }
      } catch (err) {
        console.error(`Error processing URL ${url}:`, err);
        html = err?.toString() || '';
      }

      const text = this.extractText(html);
      const links = this.extractLinks(html, startUrl, pathFilter);

      await DB.findOneAndUpdate(url, text, links);

      links.forEach((link) => {
        if (!visited.has(link) && !queue.includes(link)) {
          queue.push(link);
          totalPages++;
        }
      });
      await DB.updateScrapingStatus(visited.size, totalPages);
      return true;
    };

    while (queue.length) {
      const workers: Promise<void>[] = [];
      for (let i=0;i<parallelRequests && queue.length;i++) {
        const nextUrl = queue.shift();
        if (!nextUrl || visited.has(nextUrl)) continue;
        visited.add(nextUrl);
        workers.push((async () => {
          if (await processUrl(nextUrl)) {
            await this.delay(delaySeconds);
          }
        })());
      }
      if (workers.length > 0) {
        await Promise.all(workers);
      }
    }
    await DB.updateScrapingStatus(visited.size, totalPages);

    console.log("Finished scraping.");
  }

  async status(): Promise<any> {
    const status = await DB.getStatus();
    return status;
  }

  getSearchUrl(): string { 
    return process.env.SEARCH_URL || 'https://genezio.com/docs/';
  }
}