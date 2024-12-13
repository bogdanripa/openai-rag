import { JSDOM } from "jsdom";
import DB from "./mongo.mjs";
import Basics from "./basics.mjs";
import {Response} from 'express';

export default class Scrape {

  private static extractFolderAfterDomain(url: string): string | null {
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

  private static extractLinks(html: string, baseUrl: string): string[] {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const sitemapLinks = Array.from(document.querySelectorAll("loc")).map((anchor: any) => {
      return anchor.textContent;
    })
    .filter((url): url is string => url !== null && url.startsWith(baseUrl));

    const links = Array.from(document.querySelectorAll("a[href]"))
      .map((anchor: any) => {
        try {
          return new URL(anchor.getAttribute("href")!, baseUrl).href.replace(/#.*$/, "");
        } catch (error) {
          console.warn(`Malformed URL skipped: ${anchor.getAttribute("href")}`);
          return null;
        }
      })
      .filter((url): url is string => url !== null && url.startsWith(baseUrl));

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

    return Array.from(new Set([...links, ...scriptLinks, ...sitemapLinks]));
  }

  private static extractText (html: string): string {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Remove <script> and <style> elements
    document.querySelectorAll("script, style").forEach((el) => el.remove());
    // Extract and return the text content of the body
    return document.body.textContent?.trim() || "";
  }

  // Main Scraper Function
  static async scrape(res: Response) {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    if (!process.env.SEARCH_URL) {
      throw new Error('SEARCH_URL environment variable is not set.');
    }
    const startUrl = process.env.SEARCH_URL;
    const parallelRequests: number = 10;
    const delaySeconds: number = 1;
    const ageDays: number = 7;

    console.log(`Starting scrapeing ${startUrl}`);
    const pathFilter = Scrape.extractFolderAfterDomain(startUrl) || "/";
    const cacheThreshold = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
    const visited = new Set<string>();
    let totalPages = 1;
    const queue: string[] = [startUrl.replace(/(^\w+:\/\/[\w\.]+\/).*$/, '$1sitemap.xml')];

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

      const text = Scrape.extractText(html);
      const links = Scrape.extractLinks(html, startUrl.replace(/\/[^\/]+$/, '/'));

      await DB.findOneAndUpdate(url, text, links);

      links.forEach((link) => {
        if (!visited.has(link) && !queue.includes(link)) {
          queue.push(link);
          totalPages++;
        }
      });
      return true;
    };

    while (queue.length) {
      const workers: Promise<void>[] = [];
      for (let i=0;i<parallelRequests && queue.length;i++) {
        const nextUrl: string = queue.shift() || '';
        if (!nextUrl || visited.has(nextUrl)) continue;
        visited.add(nextUrl);
        workers.push((async () => {
          if (await processUrl(nextUrl)) {
            await Basics.delay(delaySeconds);
          }
        })());
      }
      if (workers.length > 0) {
        await Promise.all(workers);
      }
      await DB.updateScrapingStatus(visited.size, totalPages);
      if (true)
        res.write(`s ${visited.size}/${totalPages}\n`);
    }
    await DB.updateScrapingStatus(visited.size, totalPages);

    console.log("Finished scraping.");
    if (true)
      res.end();
    else 
      res.send(`s ${visited.size}/${totalPages}\n`);
  }
}